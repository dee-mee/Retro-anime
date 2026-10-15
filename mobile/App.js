import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { Asset } from 'expo-asset';
import { WebView } from 'react-native-webview';

/**
 * The whole game is one HTML file (built by `npm run build:isekai` in the parent folder),
 * shipped inside the app and opened full-screen, landscape, in a WebView. Saves live in the
 * WebView's own storage on the device.
 */
const GAME = require('./assets/game/game.html');

export default function App() {
  useKeepAwake();
  const [uri, setUri] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Asset.fromModule(GAME)
      .downloadAsync()
      .then((asset) => setUri(asset.localUri))
      .catch((e) => setError(String(e?.message || e)));
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <NavigationBar hidden />
      {uri ? (
        <WebView
          source={{ uri }}
          style={styles.root}
          originWhitelist={['*']}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          javaScriptEnabled
          domStorageEnabled
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          overScrollMode="never"
          bounces={false}
          setBuiltInZoomControls={false}
          setDisplayZoomControls={false}
          androidLayerType="hardware"
          webviewDebuggingEnabled={__DEV__}
          onError={(e) => setError(e.nativeEvent.description)}
        />
      ) : (
        <View style={styles.center}>
          {error ? <Text style={styles.text}>Could not open the game: {error}</Text> : <ActivityIndicator color="#7fd8ff" size="large" />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05080f' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { color: '#eaf6ff', padding: 24, textAlign: 'center' },
});
