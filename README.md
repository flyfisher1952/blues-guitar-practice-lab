# Blues Guitar Practice Lab

An Angular and TypeScript practice tool for electric-guitar players. It includes:

- a four-part, 20-minute practice session with a focus timer;
- high-string major, minor, and dominant-7 chord diagrams in all 12 major keys;
- three 12-bar blues progressions; and
- browser-generated drum beats for Texas shuffle, slow blues, and blues rock.

## Requirements

- Node.js 20 or newer
- npm

## Development

```bash
npm install
npm start
```

Open `http://localhost:4200`.

## Production build

```bash
npm run build
```

The static application is generated in `dist`.

## Data

The application does not require a database. Practice progress and the selected key and chord type are stored locally in the browser.
