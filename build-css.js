const fs = require('fs');
const path = require('path');

const cssFiles = [
    'node_modules/leaflet/dist/leaflet.css',
    'node_modules/leaflet.markercluster/dist/MarkerCluster.css',
    'node_modules/leaflet.markercluster/dist/MarkerCluster.Default.css'
];

let compiledCss = '';

for (const file of cssFiles) {
    const filePath = path.resolve(__dirname, file);
    if (fs.existsSync(filePath)) {
        compiledCss += fs.readFileSync(filePath, 'utf8') + '\n\n';
    } else {
        console.error(`Missing CSS file: ${filePath}`);
    }
}

const stylesPath = path.resolve(__dirname, 'styles.css');
let existingStyles = fs.readFileSync(stylesPath, 'utf8');

// Remove the @import statements
existingStyles = existingStyles.replace(/@import url\([^)]+\);\n?/g, '');

const finalCss = compiledCss + existingStyles;

// add padding: 0 to prm-map-view-container
if (!finalCss.includes('.prm-map-view-container')) {
    fs.writeFileSync(stylesPath, finalCss + '\n\n.prm-map-view-container {\n    padding: 0;\n    overflow: hidden;\n}\n');
} else {
    fs.writeFileSync(stylesPath, finalCss);
}

console.log('CSS bundled successfully!');
