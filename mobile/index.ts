import './src/polyfill';
import { LogBox } from 'react-native';

LogBox.ignoreLogs(['SafeAreaView has been deprecated']);

// Log management: console output preserved for debugging


import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);

