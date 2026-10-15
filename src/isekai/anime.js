import * as THREE from 'three'

/**
 * The old-era anime look: cel shading, ink lines and a film grade.
 *
 * Cel shading is patched straight into three's own lighting chunks, the same trick the world
 * curve uses, so every material in the game picks it up for nothing — no extra pass, no
 * extra draw. It has to go in before the first material compiles, so switching it on or off
 * takes a reload.
 *
 * The ink and the grade are one full-screen pass of their own. The scene is drawn into a
 * target with a depth texture, and a single shader finds the silhouettes in the depth,
 * inks them, tone-maps, and lays a faded, warm, grainy 90s-broadcast grade over the result.
 * It replaces the colony's whole post chain (bloom, AO, defocus, SMAA) rather than adding
 * to it, which is what keeps it affordable on a phone.
 */

const DIRECT = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );'
const CEL = /* glsl */ `
#ifndef BC_CEL
#define BC_CEL
// Light in flat bands, the way cels are painted: a shadow tone, a mid tone and full light,
// each edge a few hundredths wide so it reads as a line rather than as aliasing.
float bcCel( float x ) {
  float shade = smoothstep( 0.02, 0.07, x );
  float light = smoothstep( 0.42, 0.48, x );
  return 0.2 + shade * 0.45 + light * 0.35;
}
#endif
`

let installed = false

/** Patch three's lighting so every lit material shades in bands. Call before anything renders. */
export function installCelShading() {
  if (installed) return
  installed = true
  const C = THREE.ShaderChunk
  for (const key of ['lights_physical_pars_fragment', 'lights_lambert_pars_fragment', 'lights_phong_pars_fragment']) {
    if (!C[key]?.includes(DIRECT)) continue
    C[key] = CEL + C[key].replace(DIRECT, 'float dotNL = bcCel( saturate( dot( geometryNormal, directLight.direction ) ) );')
  }
}

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`

const INK_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uInk;
uniform float uGrade;
uniform float uTime;
varying vec2 vUv;

float viewZ( vec2 uv ) {
  float d = texture2D( tDepth, uv ).x;
  float z = d * 2.0 - 1.0;
  return ( 2.0 * uNear * uFar ) / ( uFar + uNear - z * ( uFar - uNear ) );
}

float hash( vec2 p ) {
  return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
}

void main() {
  vec3 color = texture2D( tColor, vUv ).rgb;

  // Ink: where the depth jumps relative to how far away it is, there is an outline. Lines
  // get thinner and fainter into the distance so the far forest does not go to mush.
  if ( uInk > 0.0 ) {
    float z = viewZ( vUv );
    vec2 o = uTexel * mix( 1.4, 0.8, smoothstep( 6.0, 40.0, z ) );
    float zl = viewZ( vUv - vec2( o.x, 0.0 ) );
    float zr = viewZ( vUv + vec2( o.x, 0.0 ) );
    float zu = viewZ( vUv + vec2( 0.0, o.y ) );
    float zd = viewZ( vUv - vec2( 0.0, o.y ) );
    float jump = max( max( z - zl, z - zr ), max( z - zu, z - zd ) );
    float edge = smoothstep( 0.06, 0.16, jump / max( z, 0.5 ) * 6.0 );
    edge *= 1.0 - smoothstep( 45.0, 120.0, z );
    color = mix( color, color * 0.08, edge * uInk );
  }

  gl_FragColor = vec4( color, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>

  // The grade, on the finished image: a little less saturated, warm highlights and cool,
  // lifted shadows like aged cel film, soft grain, and a vignette.
  if ( uGrade > 0.0 ) {
    vec3 c = gl_FragColor.rgb;
    float l = dot( c, vec3( 0.299, 0.587, 0.114 ) );
    vec3 graded = mix( vec3( l ), c, 0.88 );
    graded = mix( graded * vec3( 0.95, 0.98, 1.06 ) + vec3( 0.02, 0.025, 0.05 ), graded * vec3( 1.06, 1.0, 0.9 ), smoothstep( 0.25, 0.8, l ) );
    graded = floor( graded * 40.0 + 0.5 ) / 40.0;
    float grain = ( hash( vUv * 900.0 + fract( uTime * 7.0 ) * 31.0 ) - 0.5 ) * 0.045;
    vec2 q = vUv - 0.5;
    float vig = 1.0 - dot( q, q ) * 0.55;
    c = ( graded + grain ) * vig;
    gl_FragColor.rgb = mix( gl_FragColor.rgb, c, uGrade );
  }
}
`

export class AnimePost {
  constructor() {
    this.enabled = true
    this.ink = 1
    this.grade = 1
    this.target = null
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uNear: { value: 0.5 },
        uFar: { value: 900 },
        uInk: { value: 1 },
        uGrade: { value: 1 },
        uTime: { value: 0 },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: INK_FRAG,
      depthTest: false,
      depthWrite: false,
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    this.quad.frustumCulled = false
    this.scene = new THREE.Scene()
    this.scene.add(this.quad)
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  }

  _ensure(w, h) {
    if (this.target && this.target.width === w && this.target.height === h) return
    this.target?.dispose()
    const depthTexture = new THREE.DepthTexture(w, h)
    depthTexture.type = THREE.UnsignedIntType
    this.target = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
      depthBuffer: true,
      depthTexture,
    })
    this.material.uniforms.tColor.value = this.target.texture
    this.material.uniforms.tDepth.value = depthTexture
    this.material.uniforms.uTexel.value.set(1 / w, 1 / h)
  }

  render(renderer, scene, camera) {
    const canvas = renderer.domElement
    this._ensure(canvas.width, canvas.height)
    const u = this.material.uniforms
    u.uNear.value = camera.near
    u.uFar.value = camera.far
    u.uInk.value = this.ink
    u.uGrade.value = this.grade
    u.uTime.value = performance.now() / 1000
    renderer.setRenderTarget(this.target)
    renderer.clear()
    renderer.render(scene, camera)
    renderer.setRenderTarget(null)
    renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.target?.dispose()
    this.material.dispose()
    this.quad.geometry.dispose()
  }
}
