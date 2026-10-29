# Adding the IA Nexus Route Finder to the IA app

The Route Finder runs as a web page built for phone screens. Show it in your app
with a WebView: no API keys, no login, and it collects no personal data.

```
https://<ia-nexus-site>/embed/route
```

## React Native / Expo

```bash
npx expo install react-native-webview
```

```jsx
import { WebView } from 'react-native-webview';
import { useColorScheme } from 'react-native';

const ROUTE_FINDER = 'https://<ia-nexus-site>/embed/route';

export default function RouteFinderScreen({ route }) {
  const theme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const params = new URLSearchParams({ theme, ...(route.params ?? {}) });
  return <WebView source={{ uri: `${ROUTE_FINDER}?${params}` }} />;
}
```

To open it from somewhere else in the app, for example a class on the schedule:

```jsx
navigation.navigate('RouteFinder', { to: '331', toFloor: '3' });
```

## Link options

All are optional. Add them to the end of the link.

| Option | What it does | Example |
|---|---|---|
| `to`, `toFloor` | Fills in the destination | `?to=331&toFloor=3` |
| `from`, `fromFloor` | Fills in the starting room. With both ends filled in, the route shows straight away | `?from=184&fromFloor=1&to=331&toFloor=3` |
| `theme` | `light` or `dark`, to match the app | `?theme=dark` |

Rooms are written as on the school's room list: numbers such as `184`, paired
rooms such as `281/283`, and named places such as `GYM`, `Reception`,
`Courtyard` and `Xchange/Library`. A room that isn't on the list is ignored, and
the student picks it by hand.

## Where the Route Finder is in this code

You don't need any of these files to use the Route Finder in your app; the link
above is all you need. They're listed here so you can see how it works.

| Part | Files |
|---|---|
| The page your app shows | `frontend/src/pages/RoutePage.jsx` (`embed` mode) and `RoutePage.module.css` |
| Floor maps and the drawn route | `frontend/src/components/NavigationMap.jsx`, `PinPicker.jsx`, `MapLabels.jsx`, `frontend/src/lib/floorMaps.js`, `frontend/public/maps/` |
| Finding the route (server) | `backend/data/roomCoordinates.js`, and `POST /api/route` and `POST /api/route/pin` in `backend/server.js` |

Everything else in this repository (chat, accounts, schedules, the teacher
directory) is the rest of IA Nexus and isn't part of the Route Finder.

## Good to know

- **It needs internet.** It loads from the IA Nexus server like any web page.
- **The app has no header of its own on this page.** Give the screen your app's
  normal header or tab bar.
- **Privacy:** no accounts, no tracking. Saved and recent routes stay on the phone.
- **App Store:** one web screen inside an otherwise native app is normal and
  fine under Apple's rules.
