base64 -d -i ./src/clients/secret.b64 -o ./src/clients/secret.ts

EXTERNAL="./external"

rm -rf "$EXTERNAL"
mkdir -p "$EXTERNAL/hk4e"
mkdir -p "$EXTERNAL/bh3/glb/diffs"
mkdir -p "$EXTERNAL/bh3/glb/files"
mkdir -p "$EXTERNAL/hkrpg/os/diffs"
mkdir -p "$EXTERNAL/hkrpg/os/files"

curl -sSL https://github.com/3Shain/neutralinojs/releases/download/v4.11.0-1/neutralinojs-v4.11.0.zip > neu.zip
unzip -o -d bin neu.zip
rm neu.zip

curl -sSL https://github.com/neutralinojs/neutralino.js/releases/download/v3.9.0/neutralino.js > neutralino.js
