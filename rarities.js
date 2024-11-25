const fs = require('fs');
const path = require('path');

const basePath = process.cwd();
const layersDir = `${basePath}/layers`;
const outputFile = `${basePath}/layers_data.json`;

const rarityDelimiter = '#';

function getLayerData(dir) {
  const layerData = {};

  fs.readdirSync(dir).forEach(layerFolder => {
    const layerPath = path.join(dir, layerFolder);
    if (fs.statSync(layerPath).isDirectory()) {
      layerData[layerFolder] = [];

      fs.readdirSync(layerPath).forEach(file => {
        if (file.endsWith('.png')) {
          const name = file.replace('.png', '');
          let [trait, weight] = name.split(rarityDelimiter);
          const rarity = parseInt(weight) || 1; // Default to 1 if no weight is specified
          // if trait contains the word "Miltary" then change the word "Miltary" to "Military"
          if (trait.includes('Miltary')) {
            trait = trait.replace('Miltary', 'Military');
          }
          
          // Create new file name with rarity - preserve existing rarity if present
          const newFileName = weight ? `${trait}${rarityDelimiter}${weight}.png` : `${trait}.png`;
          
          // Rename the file
          fs.renameSync(path.join(layerPath, file), path.join(layerPath, newFileName));
          
          layerData[layerFolder].push({
            name: trait,
            fileName: newFileName,
            rarity: rarity
          });
        }
      });
    }
  });

  return layerData;
}

function saveLayersToJson() {
  const layerData = getLayerData(layersDir);
  
  fs.writeFileSync(outputFile, JSON.stringify(layerData, null, 2));
  console.log(`Layer data saved to ${outputFile}`);
  console.log('File names updated with rarity values');
}

saveLayersToJson();