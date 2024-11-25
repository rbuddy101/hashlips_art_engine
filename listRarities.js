const fs = require('fs');
const path = require('path');

// Define the folder containing the JSON files and layers_data.json
const folder = '/mnt/dev/nft/build/json'

// Path to layers_data.json is in current working directory
const layersDataPath = path.join(process.cwd(), 'layers_data.json');

// Check if layers_data.json exists
if (!fs.existsSync(layersDataPath)) {
  console.error('layers_data.json not found in the build/json folder.');
  process.exit(1);
}

// Read and parse layers_data.json to get all possible traits and their values
let layersData;
try {
  const layersContent = fs.readFileSync(layersDataPath, 'utf8');
  layersData = JSON.parse(layersContent);
} catch (error) {
  console.error('Error reading or parsing layers_data.json:', error);
  process.exit(1);
}

// Initialize an object to hold trait counts with all traits set to 0
const traitsCount = {};

// Populate traitsCount with all traits and their possible values from layers_data.json
Object.keys(layersData).forEach((trait_type) => {
  traitsCount[trait_type] = {};
  layersData[trait_type].forEach((trait) => {
    const value = trait.name || trait.fileName.replace('#30.png', '').replace('#20.png', '');
    traitsCount[trait_type][value] = {
      count: 0,
      rarity: trait.rarity || 'N/A' // Added rarity from layersData
    };
  });
});

// Read all JSON files in the folder excluding layers_data.json and rarity.json
const files = fs
  .readdirSync(folder)
  .filter(
    (file) =>
      file.endsWith('.json') &&
      file !== 'layers_data.json' &&
      file !== 'rarity.json'
  );

if (files.length === 0) {
  console.error('No edition JSON files found in the build/json folder.');
  process.exit(1);
}

// Total number of editions
const totalEditions = files.length;

// Loop through all the .json files and count traits
files.forEach((file) => {
  const filePath = path.join(folder, file);
  const contents = fs.readFileSync(filePath, 'utf8');
  let json;

  try {
    json = JSON.parse(contents);
  } catch (error) {
    console.error(`Error parsing JSON in file ${file}:`, error);
    return;
  }

  if (!json.attributes || !Array.isArray(json.attributes)) {
    console.warn(`No attributes found in file ${file}. Skipping.`);
    return;
  }

  // Iterate over each attribute
  json.attributes.forEach((attribute) => {
    const { trait_type, value } = attribute;

    if (!trait_type || !value) {
      console.warn(`Invalid attribute in file ${file}:`, attribute);
      return;
    }

    // Normalize value if necessary (e.g., handle different naming conventions)
    const normalizedValue = value;

    // Check if the trait_type and value exist in layers_data.json
    if (
      traitsCount.hasOwnProperty(trait_type) &&
      traitsCount[trait_type].hasOwnProperty(normalizedValue)
    ) {
      // Increment the count
      traitsCount[trait_type][normalizedValue].count += 1;
    } else {
      console.warn(
        `Trait "${trait_type}: ${normalizedValue}" in file ${file} does not exist in layers_data.json.`
      );
      // Optionally, you can choose to handle traits not defined in layers_data.json
      // For example, add them dynamically or ignore
    }
  });
});

// Calculate percentages
const rarity = {};

Object.keys(traitsCount).forEach((trait_type) => {
  rarity[trait_type] = {};

  Object.keys(traitsCount[trait_type]).forEach((value) => {
    const { count, rarity: traitRarity } = traitsCount[trait_type][value];
    const percentage = ((count / totalEditions) * 100).toFixed(2);
    rarity[trait_type][value] = { 
      count, 
      percentage: `${percentage}%`,
      rarity: traitRarity // Included trait rarity in the output
    };
  });
});

// Define the output path for rarity.json
const rarityPath = path.join(process.cwd(), 'rarity.json');

// Write the rarity object to rarity.json
fs.writeFileSync(rarityPath, JSON.stringify(rarity, null, 2));

console.log(`Rarity data has been saved to ${rarityPath}`);
