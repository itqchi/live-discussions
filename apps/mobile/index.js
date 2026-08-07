import { AppRegistry } from 'react-native';
import { registerGlobals } from '@livekit/react-native';
import App from './src/app/App';

registerGlobals();

AppRegistry.registerComponent('LiveDiscussions', () => App);
