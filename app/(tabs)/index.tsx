import { Redirect } from 'expo-router';

// The (tabs) group's index route. It has no tab of its own (href:null in the
// layout); any navigation that lands on the group root should always resolve
// to the workspace tab so the workspace auto-displays after login / launch.
export default function HomeScreen() {
  return <Redirect href="/(tabs)/workspace" />;
}
