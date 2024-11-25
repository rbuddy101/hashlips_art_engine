const basePath = process.cwd();
const { NETWORK } = require(`${basePath}/constants/network.js`);
const rules = require(`${basePath}/src/rules.js`); // Import the rules
const fs = require("fs");
const sha1 = require(`${basePath}/node_modules/sha1`);
const { createCanvas, loadImage } = require(`${basePath}/node_modules/canvas`);
//const buildDir = `${basePath}/build`;
// build directory should be opensuse path /mnt/dev/nft/build
const buildDir = `/mnt/dev/nft/build`;
const layersDir = `${basePath}/layers`;
const {
  format,
  baseUri,
  description,
  background,
  uniqueDnaTorrance,
  layerConfigurations,
  rarityDelimiter,
  shuffleLayerConfigurations,
  debugLogs,
  extraMetadata,
  text,
  namePrefix,
  network,
  solanaMetadata,
  gif,
} = require(`${basePath}/src/config.js`);
const canvas = createCanvas(format.width, format.height);
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = format.smoothing;
var metadataList = [];
var attributesList = [];
var dnaList = new Set();
const DNA_DELIMITER = "-";
const HashlipsGiffer = require(`${basePath}/modules/HashlipsGiffer.js`);
const _ = require('lodash');
const cliProgress = require('cli-progress');
const imageCache = new Map();


let hashlipsGiffer = null;

// Add a cache object at the top
const layerElementsCache = {};

// Setup build directories
const buildSetup = () => {
  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true }); // Updated to fs.rm
  }
  fs.mkdirSync(buildDir);
  fs.mkdirSync(`${buildDir}/json`);
  fs.mkdirSync(`${buildDir}/images`);
  if (gif.export) {
    fs.mkdirSync(`${buildDir}/gifs`);
  }
};

// Get rarity weight from filename
const getRarityWeight = (_str) => {
  let nameWithoutExtension = _str.slice(0, -4);
  var nameWithoutWeight = Number(
    nameWithoutExtension.split(rarityDelimiter).pop()
  );
  if (isNaN(nameWithoutWeight)) {
    nameWithoutWeight = 1;
  }
  return nameWithoutWeight;
};

// Clean DNA string
const cleanDna = (_str) => {
  if (!_str) {
    console.error("Input string is undefined in cleanDna");
    return null;
  }
  const withoutOptions = removeQueryStrings(_str);
  var dna = Number(withoutOptions.split(":").shift());
  return isNaN(dna) ? null : dna;
};

// Clean name by removing rarity weight
const cleanName = (_str) => {
  let nameWithoutExtension = _str.slice(0, -4);
  var nameWithoutWeight = nameWithoutExtension.split(rarityDelimiter).shift();
  return nameWithoutWeight;
};


// Updated getElements function to handle multiple layers with different trait dependencies
const getElements = (path, layerName, shirtTraits = []) => {
  if (layerElementsCache[layerName]) {
    return layerElementsCache[layerName];
  }

  const elements = fs
    .readdirSync(path)
    .filter((item) => !/(^|\/)\.[^\/\.]/g.test(item))
    .map((i, index) => {
      if (i.includes("-")) {
        // Replace dashes with underscores or throw an error
        throw new Error(`Layer name cannot contain dashes. Please fix: ${i}`);
      }
      // clean name

      let nameWithoutExtension = i.slice(0, -4); // Remove .png
      // remove delimeter 
      let nameWithoutDelimiter = nameWithoutExtension.split(rarityDelimiter).shift();
      let parts = nameWithoutDelimiter.split('_');

      let accessoryName = parts[0].toLowerCase();
      let shirt = null;
      let skin = null;
      let size = null;
      let color = null; // For Hair and Beard

      if (layerName.toLowerCase() === 'accessories') {
        // Accessories can have 1 to 3 parts: AccessoryName, Shirt (optional), Skin (optional)
        if (parts.length === 3) {
          shirt = parts[1].toLowerCase();
          skin = parts[2].toLowerCase();
        } else if (parts.length === 2) {
          // Determine if the second part is Shirt or Skin based on available Shirt traits
          if (shirtTraits.includes(parts[1].toLowerCase())) {
            shirt = parts[1].toLowerCase();
          } else {
            skin = parts[1].toLowerCase();
          }
        }
        // If parts.length === 1, no Shirt or Skin
      } else if (layerName.toLowerCase() === 'nose') {
        // // nose is 2 parts. Second part is the skin, first is the size
        size = parts[0].toLowerCase();
        skin = parts[1].toLowerCase();

      } else if (layerName.toLowerCase() === 'hair' || layerName.toLowerCase() === 'beard') {
        // Hair and Beard have 1 or 2 parts: Hair_Color or Beard_Color
        if (parts.length === 2) {
          color = parts[1].toLowerCase();
        }
        // If parts.length === 1, it might be 'None' or a default trait

      }



      return {
        id: index,
        name: cleanName(i),
        filename: i,
        path: `${path}${i}`,
        weight: getRarityWeight(i),
        shirt: shirt || null,   // For Accessories
        skin: skin || null,     // For Accessories and Nose
        size: size || null,     // For Nose
        color: color || null,   // For Hair and Beard
      };
    });

  layerElementsCache[layerName] = elements;
  return elements;
};

// Setup layers
const layersSetup = (layersOrder, shirtTraits) => {
  const layers = layersOrder.map((layerObj, index) => ({
    id: index,
    elements: getElements(`${layersDir}/${layerObj.name}/`, layerObj.name, shirtTraits),
    name:
      layerObj.options?.["displayName"] != undefined
        ? layerObj.options?.["displayName"]
        : layerObj.name,
    blend:
      layerObj.options?.["blend"] != undefined
        ? layerObj.options?.["blend"]
        : "source-over",
    opacity:
      layerObj.options?.["opacity"] != undefined
        ? layerObj.options?.["opacity"]
        : 1,
    bypassDNA:
      layerObj.options?.["bypassDNA"] !== undefined
        ? layerObj.options?.["bypassDNA"]
        : false,
  }));
  return layers;
};

// Asynchronous saveImage function
const saveImage = async (_editionCount) => {
  try {
    await fs.promises.writeFile(
      `${buildDir}/images/${_editionCount}.png`,
      canvas.toBuffer("image/png")
    );
    //console.log(`Image saved for edition ${_editionCount}`);
  } catch (error) {
    console.error(`Failed to save image for edition ${_editionCount}:`, error);
    throw error; // Re-throw if you want to handle it upstream
  }
};

// Generate random background color
const genColor = () => {
  let hue = Math.floor(Math.random() * 360);
  let pastel = `hsl(${hue}, 100%, ${background.brightness})`;
  return pastel;
};

// Draw background
const drawBackground = () => {
  ctx.fillStyle = background.static ? background.default : genColor();
  ctx.fillRect(0, 0, format.width, format.height);
};

// Add metadata to the list
const addMetadata = (_dna, _edition) => {
  let dateTime = Date.now();
  let tempMetadata = {
    name: `${namePrefix} #${_edition}`,
    description: description,
    image: `${baseUri}/${_edition}.png`,
    dna: sha1(_dna),
    edition: _edition,
    date: dateTime,
    ...extraMetadata,
    attributes: attributesList,
    compiler: "HashLips Art Engine",
  };

  if (network == NETWORK.sol) {
    tempMetadata = {
      // Added metadata for Solana
      name: tempMetadata.name,
      symbol: solanaMetadata.symbol,
      description: tempMetadata.description,
      seller_fee_basis_points: solanaMetadata.seller_fee_basis_points,
      image: `${_edition}.png`,
      external_url: solanaMetadata.external_url,
      edition: _edition,
      ...extraMetadata,
      attributes: tempMetadata.attributes,
      properties: {
        files: [
          {
            uri: `${_edition}.png`,
            type: "image/png",
          },
        ],
        category: "image",
        creators: solanaMetadata.creators,
      },
    };
  }

  metadataList.push(tempMetadata);
  attributesList = [];
};

// Add attributes to the list
const addAttributes = (_element) => {
  const layerName = _element.layer.name.toLowerCase();
  if (layerName === 'background2') {
    return;
  }
  const selectedElement = _element.layer.selectedElement;

  // Define layers that should have a "None" attribute when no trait is selected
  const layersWithNone = ['accessories', 'beard', 'hair', 'glasses', 'necklace', 'hat', 'eyes', 'mouth_items'];

  if (layersWithNone.includes(layerName) && !selectedElement) {
    attributesList.push({
      trait_type: _element.layer.name,
      value: "None",
    });
    return;
  }


  // If a trait is selected, add it to the attributes list
  if (selectedElement) {
    attributesList.push({
      trait_type: _element.layer.name,
      value: selectedElement.name,
    });
  }
};

const loadLayerImg = async (_layer) => {
  try {
    if (_layer.selectedElement) {
      const imagePath = `${_layer.selectedElement.path}`;
      
      if (imageCache.has(imagePath)) {
        return { layer: _layer, loadedImage: imageCache.get(imagePath) };
      }
      
      const image = await loadImage(imagePath);
      // Limit cache size to prevent memory issues
      // dont cache the accessories layer images  
      if (_layer.name !== 'Accessories') {
        if (imageCache.size < 270) {
          imageCache.set(imagePath, image);
        } else {
         // console.log("Image cache is full while loading layer:", _layer.name);
        } 
      }
      
      return { layer: _layer, loadedImage: image };
    } else {
      console.log(`No image to load for ${_layer.name}`);
      return null;
    }
  } catch (error) {
    console.error("Error loading image:", error);
    return null;
  }
};

// Add text to image (optional)
const addText = (_sig, x, y, size) => {
  ctx.fillStyle = text.color;
  ctx.font = `${text.weight} ${size}pt ${text.family}`;
  ctx.textBaseline = text.baseline;
  ctx.textAlign = text.align;
  ctx.fillText(_sig, x, y);
};

// Draw each element onto the canvas
const drawElement = (_renderObject, _index, _layersLen) => {
  if (_renderObject === null) return;

  const { layer, loadedImage } = _renderObject;

  // Only change canvas state if different from current
  if (ctx.globalAlpha !== layer.opacity) {
    ctx.globalAlpha = layer.opacity;
  }
  if (ctx.globalCompositeOperation !== layer.blend) {
    ctx.globalCompositeOperation = layer.blend;
  }

  if (text.only) {
    addText(
      `${layer.name}${text.spacer}${layer.selectedElement.name}`,
      text.xGap,
      text.yGap * (_index + 1),
      text.size
    );
  } else {
    ctx.drawImage(loadedImage, 0, 0, format.width, format.height);
  }

  addAttributes(_renderObject);
};

// Map DNA to layers
const constructLayerToDna = (_dna = "", _layers = []) => {
  if (!_dna) {
    console.error("DNA is undefined or null in constructLayerToDna");
    return { mappedLayers: [], error: true };
  }
  let mappedDnaToLayers = _layers.map((layer, index) => {
    let dnaSegment = _dna.split(DNA_DELIMITER)[index];
    if (!dnaSegment || dnaSegment === undefined) {
      console.warn(`DNA segment is missing for layer ${layer.name}. Using 'None' trait.`);
      return { error: true };
    }
    let selectedElement = layer.elements.find(
      (e) => e.id === cleanDna(dnaSegment)
    );
    return {
      name: layer.name,
      blend: layer.blend,
      opacity: layer.opacity,
      selectedElement: selectedElement,
      error: false
    };
  });

  // Check if any layer has an error
  const hasError = mappedDnaToLayers.some(layer => layer.error);

  return {
    mappedLayers: mappedDnaToLayers,
    error: hasError
  };
};

/**
 * In some cases a DNA string may contain optional query parameters for options
 * such as bypassing the DNA isUnique check, this function filters out those
 * items without modifying the stored DNA.
 *
 * @param {String} _dna New DNA string
 * @returns new DNA string with any items that should be filtered, removed.
 */
const filterDNAOptions = (_dna) => {
  const dnaItems = _dna.split(DNA_DELIMITER);
  const filteredDNA = dnaItems.filter((element) => {
    const query = /(\?.*$)/;
    const querystring = query.exec(element);
    if (!querystring) {
      return true;
    }
    const options = querystring[1].split("&").reduce((r, setting) => {
      const keyPairs = setting.split("=");
      return { ...r, [keyPairs[0]]: keyPairs[1] };
    }, {});
    return options.bypassDNA;
  });
  return filteredDNA.join(DNA_DELIMITER);
};

/**
 * Cleaning function for DNA strings. When DNA strings include an option, it
 * is added to the filename with a ?setting=value query string. It needs to be
 * removed to properly access the file name before Drawing.
 *
 * @param {String} _dna The entire newDNA string
 * @returns Cleaned DNA string without querystring parameters.
 */
const removeQueryStrings = (_dna) => {
  if (!_dna) {
    console.error("DNA is undefined in removeQueryStrings");
    return "";
  }
  const query = /(\?.*$)/;
  //console.log("Removing query strings from DNA:", _dna);
  return _dna.replace(query, "");
};

// Check if DNA is unique
const isDnaUnique = (_DnaList = new Set(), _dna = "") => {
  const _filteredDNA = filterDNAOptions(_dna);
  return !_DnaList.has(_filteredDNA);
};

/**
 * Removes blocked traits from the current layer based on already selected traits from other layers.
 * Implements looser syntax checking by normalizing trait names and allowing partial matches.
 * Additionally handles the 'All' exclusion option to exclude all traits from a specific layer.
 *
 * @param {Object} currentLayer - The current layer object containing its elements.
 * @param {Object} selectedTraits - An object mapping layer names to their selected trait names.
 * @returns {Object} - The updated layer with excluded traits removed.
 */
const removeBlockedTraits = (currentLayer, selectedTraits) => {
  const rules = require(`${basePath}/src/rules.js`);
  const exclusions = [];

  const normalizeTrait = (trait) => {
    if (!trait) return '';
    return trait.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  };

  for (const [layerName, traitName] of Object.entries(selectedTraits)) {
    if (traitName == 'None' || traitName == 'none') {
      continue;
    }

    const layerRules = rules.excludeRules[layerName];
    if (!layerRules) {
      //console.warn(`No exclusion rules found for layer "${layerName}"`);
      continue;
    } else {
      // console.log("Layer rules found for layer:", layerName);
    }

    if (layerRules['All']) {
      // console.log("All exclusion found");
      const exclude = layerRules['All'].exclude;
      if (exclude && exclude[currentLayer.name]) {
        exclusions.push(...exclude[currentLayer.name]);
        // console.log(`Excluding ALL traits from layer "${currentLayer.name}"`);
      }
    }

    if (layerRules[traitName]) {
      const exclude = layerRules[traitName].exclude;
      if (exclude && exclude[currentLayer.name]) {
        exclusions.push(...exclude[currentLayer.name]);
        // console.log(`Excluding traits from layer "${currentLayer.name}" based on trait "${traitName}" in layer "${layerName}":`, exclude[currentLayer.name]);
      }
    } else {
      // console.log(`No exclusion rules found for trait "${traitName}" in layer "${layerName}"`);
    }

    if (traitName.includes('_')) {
      const traitPrefix = traitName.split('_')[0];
      const excludePrefix = layerRules[traitPrefix]?.exclude;
      if (excludePrefix && excludePrefix[currentLayer.name]) {
        exclusions.push(...excludePrefix[currentLayer.name]);
        // console.log(`Excluding traits from layer "${currentLayer.name}" based on prefix "${traitPrefix}" in layer "${layerName}":`, excludePrefix[currentLayer.name]);
      }
    }
  }

  if (exclusions.length === 0) {
    return currentLayer;
  }

  const exclusionsNormalized = exclusions.map(trait => normalizeTrait(trait));
  // console.log("Normalized exclusions for current layer:", exclusionsNormalized);

  if (exclusionsNormalized.includes('all')) {
    // console.log(`Excluding all traits from layer "${currentLayer.name}" due to 'All' exclusion.`);
    // remove all elements except for the one name "None"
    currentLayer.elements = currentLayer.elements.filter(element => element.name === "None");
    return currentLayer;
  }

  currentLayer.elements = currentLayer.elements.filter(element => {
    const elementNormalized = normalizeTrait(element.name);
    const isExcluded = exclusionsNormalized.some(exclusion => elementNormalized.includes(exclusion));
    if (isExcluded) {
      // console.log(`Excluding trait "${element.name}" from layer "${currentLayer.name}"`);
      return false;
    }
    return true;
  });

  if (currentLayer.elements.length === 0) {
    console.warn(`All traits have been excluded from layer "${currentLayer.name}".`);
  } else {
    // // console.log(`Layer "${currentLayer.name}" elements after exclusion:`, currentLayer.elements);
  }

  //// console.log("Current layer elements after filtering:", currentLayer.elements);
  return currentLayer;
};

// Create DNA string
const createDna = (_layers) => {
  let selectedTraits = {}; // Store selected traits for exclusion checks    
  let randNum = [];
  let skin = null;
  let shirt = null;
  let color = null;
  let mouth = null

  // Create a deep copy of the layers using lodash's cloneDeep
  const layersCopy = _.cloneDeep(_layers);

  for (let layerIndex = 0; layerIndex < layersCopy.length; layerIndex++) {
    let layer = layersCopy[layerIndex];
    var totalWeight = 0;

    if (layer.name.toLowerCase() === 'hair') {
      // console.log("Beard layer");
      if (color !== 'any') {
      layer.elements = layer.elements.filter(element => {
        if (element.name.includes('_')) {
          const colorFound = element.name.split('_')[1];
          return colorFound === color;
        }
        return true;
      });
      }
    } else if (layer.name.toLowerCase() === 'accessories' && skin !== 'ghost') {
      // console.log("Accessories layer");
      // console.log("Shirt:", shirt, "Skin:", skin);
      let foundMatch = false;
      if (shirt == "Knights Armor") {
        // console.log("Knights Armor");
        // use accessries that have the word knights in the name
        layer.elements = layer.elements.filter(element => element.name.includes('Knights Armor'));
        // console.log("Accessories layer elements:", layer.elements);
      } else if (shirt == "Space Suit") {

        // console.log("Space Suit");
        layer.elements = layer.elements.filter(element => element.name.includes('Space Suit'));
        // console.log("Accessories layer elements:", layer.elements);
      } else {
        layer.elements = layer.elements.filter(element => {
          if (element.name.includes('_')) {
            const shirtFound = element.name.split('_')[1];
            const skinFound = element.name.split('_')[2];
            // // console.log("Shirt Found:", shirtFound, "Skin Found:", skinFound);
            if ((shirtFound === shirt) && skinFound === skin) {
              // console.log("Accessory Match:", element.name);
              foundMatch = true;
              return true;
            } else if (skinFound === undefined && shirtFound === shirt) {
              // console.log("Accessory Match No Skin:", element.name);
              foundMatch = true;
              return true;
          } else if (shirtFound === 'Naked' && skinFound === skin ) {
              // console.log("Accessory Match Naked:", element.name);
              return true;
            }
            return false;
          }
          return true;
        });
      }

      if (foundMatch) {
       // loop through and remove all elements with the word naked in it regardless of case
       layer.elements = layer.elements.filter(element => element.name.toLowerCase().indexOf('naked') == -1);  
      } else {
        // Using naked, we want to increase the weight of none
        layer.elements.forEach(element => {
          if (element.name.toLowerCase() === 'none') {
            // multiply the weight by 2x
            element.weight *= 2;
          }
        });
      }
      if (layer.elements.length === 0) {
        console.error("No matching accessory found for Edition");
        // exit process
        process.exit(1);
      }
      // if length of elements is 0 then set to none
    } else if (layer.name.toLowerCase() === 'nose') {
      // console.log("Nose layer");
      // console.log("Nose Color:", skin);
      layer.elements = layer.elements.filter(element => element.name.split('_')[1] === skin);
    } else if (layer.name.toLowerCase() === 'glasses') {
      // console.log("Glasses layer");
    } else if (layer.name.toLowerCase() === 'mouth') {
      // console.log("Mouth layer");
      // if skin is black then exclude all mouth_items with the word white in the name
      if (skin) {
      if (skin.toLowerCase() === 'black') {
        layer.elements = layer.elements.filter(element => !element.name.includes('White'));
      } else if (skin.toLowerCase() !== 'black') {
        // remove all mouth_items with the word black in the name
        layer.elements = layer.elements.filter(element => !element.name.includes('Black'));
        }
      }
    } else if (layer.name.toLowerCase() === 'mouth_items') {
      let matchFound = false;
     // loop through all elements and log the current mouth and the current element name
     if (skin.toLowerCase() !== 'ghost') {
     for (let i = 0; i < layer.elements.length; i++) {
      // console.log("Mouth:", mouth, "Element:", layer.elements[i].name);
      if (mouth.split('_')[0] === layer.elements[i].name) {
        // console.log("Mouth item match:", layer.elements[i].name, "Mouth:", mouth);
        // remove all elements except for the matching index 
        layer.elements = [layer.elements[i]];
        matchFound = true;
        break;
      }
     }
    }
     if (matchFound === false) {
      // console.log("No mouth item match found, excluding all mouth_items");
      // remove all elements except for the one name "None"
        layer.elements = layer.elements.filter(element => element.name === 'None');
        // console.log("Remaining elements:", layer.elements);
      }
    }
      //// console.log("Selected traits:", selectedTraits);
      layer = removeBlockedTraits(layer, selectedTraits);
      // if length of elements is 0 then set to none
      if (layer.elements.length === 0 && layer.name == 'accessories') {
        // console.log("No elements found for layer using NONE:", layer.name);
        //exit process
        process.exit();
      }
      // // console.log("Layer elements after filtering:", layer.elements);
      layer.elements.forEach(element => {
        totalWeight += element.weight;
      });

      let random = Math.floor(Math.random() * totalWeight);
      // console.log("Going through layer:", layer.name);
      // // console.log("Layer elements:", layer.elements);

      for (let i = 0; i < layer.elements.length; i++) {
        random -= layer.elements[i].weight;
        if (random < 0) {
          if (layer.name.toLowerCase() === 'skin') {
            skin = layer.elements[i].name;
            // console.log("Skin:", skin);
          }
          if (layer.name.toLowerCase() === 'shirt') {
            shirt = layer.elements[i].name;
            // console.log("Shirt:", shirt);
          }
          // if (layer.name.toLowerCase() === 'hair') {
          //   if (layer.elements[i].name.includes('_')) {
          //     color = layer.elements[i].name.split('_')[1];
          //   }
          //   // console.log("Hair Color:", color);
          // }
          if (layer.name.toLowerCase() === 'beard') {
            if (layer.elements[i].name.includes('_')) {
              color = layer.elements[i].name.split('_')[1];
            } else {
              color = 'any';
            }
            // console.log("Hair Color:", color);
          }
          if (layer.name.toLowerCase() === 'necklace') {
            // console.log("Necklace in elements:", layer.elements[i].name);
          }
          if (layer.name.toLowerCase() === 'mouth') {
            mouth = layer.elements[i].name;
            // console.log("Mouth:", mouth);
          }
          // console.log("Random:", random, "Layer:", layer.name, "Element:", layer.elements[i].name);
          selectedTraits[layer.name] = layer.elements[i].name;
          //  console.log("Selected traits:", selectedTraits);
          randNum.push(
            `${layer.elements[i].id}:${layer.elements[i].filename}${layer.bypassDNA ? "?bypassDNA=false" : ""
            }`
          );
          // console.log("Selected traits:", selectedTraits);
          break;
        }
      }
    }
    return randNum.join(DNA_DELIMITER);
  };

// Write all metadata to a single file
const writeMetaData = (_data) => {
  fs.writeFileSync(`${buildDir}/json/_metadata.json`, _data);
};

// Asynchronous saveMetaDataSingleFile function
const saveMetaDataSingleFile = async (_editionCount) => {
  try {
    const metadata = metadataList.find((meta) => meta.edition == _editionCount);
    
    // this is where we need to save the changed names
    // loop througg the metadata.attributes and change the name to the displayName if it exists
    metadata.attributes.forEach(attribute => {
      if (attribute.trait_type === 'Accessories') {
        // if it contains a _ then split by that and use the first part
        if (attribute.value.includes('_')) {
          attribute.value = attribute.value.split('_')[0];
        }
      } else if (attribute.trait_type === 'Beard') {
        if (attribute.value.includes('_')) {
          attribute.value = attribute.value.split('_')[1];
        }
      } else if (attribute.trait_type === 'Hair') {
        if (attribute.value.includes('_')) {
          attribute.value = attribute.value.split('_')[1];
        }
      } else if (attribute.trait_type === 'Mouth') {
        if (attribute.value.includes('_')) {
          attribute.value = attribute.value.split('_')[1];
        }
      } else if (attribute.trait_type === 'Mouth_Items') {
        // remove _ and change to space in the trait_type
        attribute.trait_type = attribute.trait_type.replace(/_/g, ' ');
      }
      // entired remove Eyeb
    });
    // remove the Eyebrow attribute 
    metadata.attributes = metadata.attributes.filter(attribute => attribute.trait_type !== 'Eyebrow');

    //console.log("Metadata:", metadata);
    if (debugLogs) {
      console.log(
        `Writing metadata for ${_editionCount}: ${JSON.stringify(metadata)}`
      );
    }
    await fs.promises.writeFile(
      `${buildDir}/json/${_editionCount}.json`,
      JSON.stringify(metadata, null, 2)
    );
    //console.log(`Metadata saved for edition ${_editionCount}`);
  } catch (error) {
    console.error(`Failed to save metadata for edition ${_editionCount}:`, error);
    throw error; // Re-throw to handle upstream if necessary
  }
};

// Shuffle array (optional)
function shuffle(array) {
  let currentIndex = array.length,
    randomIndex;
  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
  return array;
}

  // Main function to start creating NFTs
  const startCreating = async () => {
    let layerConfigIndex = 0;
    let editionCount = 1;
    let failedCount = 0;
    let abstractedIndexes = [];

    for (
      let i = network == NETWORK.sol ? 0 : 1;
      i <= layerConfigurations[layerConfigurations.length - 1].growEditionSizeTo;
      i++
    ) {
      abstractedIndexes.push(i);
    }

    if (shuffleLayerConfigurations) {
      abstractedIndexes = shuffle(abstractedIndexes);
    }

    const totalEditions = abstractedIndexes.length;
    const progressBar = new cliProgress.SingleBar({
      format: 'Progress: [{bar}] {percentage}% | ETA: {eta} | {value}/{total} | Speed: {speed} | Avg Load: {avgLoad} | Avg NFT: {avgNFT}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    }, cliProgress.Presets.shades_classic);
    progressBar.start(totalEditions, 0);

    const startTime = Date.now();
    let lastUpdateTime = startTime;
    let totalLoadTime = 0;
    let nftCount = 0;

    while (layerConfigIndex < layerConfigurations.length) {
        const layers = layersSetup(
        layerConfigurations[layerConfigIndex].layersOrder
        );

        while (
        editionCount <= layerConfigurations[layerConfigIndex].growEditionSizeTo
        ) {
        const loopStartTime = Date.now();

          const newDna = createDna(layers);

        if (isDnaUnique(dnaList, newDna)) {
          const results = constructLayerToDna(newDna, layers);
          if (results.error) {
            console.error("Error in constructLayerToDna: Skipping this generation.");
            failedCount++;
            
            if (failedCount >= uniqueDnaTorrance) {
                console.error(
                    `You need more layers or elements to grow your edition to ${layerConfigurations[layerConfigIndex].growEditionSizeTo} artworks!`
                );
                process.exit(1);
            }
            
            continue; // Skip to the next iteration
          }

          const mappedLayers = results.mappedLayers;

          // Reset failedCount on successful generation
          failedCount = 0;

            let loadedElements = [];

            // Check for spacesuit hat
            let spacesuitHat = mappedLayers.some(layer => layer.name === 'Hat' && layer.selectedElement.name === 'Space Suit');

            const loadStartTime = Date.now();
            const loadPromises = mappedLayers.map(layer => loadLayerImg(layer));
          const loadedElementsArray = await Promise.all(loadPromises);
            const loadEndTime = Date.now();
          totalLoadTime += loadEndTime - loadStartTime;

            loadedElements = loadedElementsArray;

            if (spacesuitHat) {
              const spacesuitAccessory = {
                name: 'Background2',
                blend: 'source-over',
                opacity: 1,
                selectedElement: {
                  id: 999999999,
                  name: 'Space Suit Back',
                  filename: 'Space Suit_Back.png',
                path: '/home/will/Documents/GitHub/hashlips_art_engine/layers/Space Suit_Back.png',
                  weight: 1,
                  shirt: 'space suit',
                  skin: 'black',
                  size: null,
                  color: null
                }
              };
              const spacesuitElement = await loadLayerImg(spacesuitAccessory);
              loadedElements.splice(1, 0, spacesuitElement);
            }


          const nftStartTime = Date.now();
          await Promise.all(loadedElements).then(async (renderObjectArray) => {
            ctx.clearRect(0, 0, format.width, format.height);
            if (gif.export) {
              hashlipsGiffer = new HashlipsGiffer(
                canvas,
                ctx,
                `${buildDir}/gifs/${abstractedIndexes[0]}.gif`,
                gif.repeat,
                gif.quality,
                gif.delay
              );
              hashlipsGiffer.start();
            }
            if (background.generate) {
              drawBackground();
            }
            for (const renderObject of renderObjectArray) {
              if (renderObject) {
                drawElement(
                  renderObject,
                  renderObjectArray.indexOf(renderObject),
                  layerConfigurations[layerConfigIndex].layersOrder.length
                );
                if (gif.export) {
                  hashlipsGiffer.add();
                }
              }
            }
            if (gif.export) {
              hashlipsGiffer.stop();
            }

            await Promise.all([
              saveImage(abstractedIndexes[0]),
              addMetadata(newDna, abstractedIndexes[0]),
              saveMetaDataSingleFile(abstractedIndexes[0])
            ]);

            dnaList.add(filterDNAOptions(newDna));
            editionCount++;
            abstractedIndexes.shift();

            const loopEndTime = Date.now();
            const loopTime = loopEndTime - loopStartTime;
            nftCount++;

            const currentTime = Date.now();
            const elapsedTime = currentTime - startTime;
            const timePerEdition = elapsedTime / nftCount;
            const remainingTime = timePerEdition * (totalEditions - nftCount);

            if (currentTime - lastUpdateTime > 1000) {
              const avgLoadTime = totalLoadTime / nftCount;
              const avgNFTTime = elapsedTime / nftCount;

              progressBar.update(nftCount, {
                speed: `${(timePerEdition / 1000).toFixed(2)}s/edition`,
                eta: `${(remainingTime / 60000).toFixed(0)}m`,
                avgLoad: `${avgLoadTime.toFixed(2)}ms/load`,
                avgNFT: `${(avgNFTTime / 1000).toFixed(2)}s/NFT`
              });
              lastUpdateTime = currentTime;
            }
          });
        } else {
          console.log("DNA exists!");
          failedCount++;
          
          if (failedCount >= uniqueDnaTorrance) {
              console.log(
                  `You need more layers or elements to grow your edition to ${layerConfigurations[layerConfigIndex].growEditionSizeTo} artworks!`
              );
              process.exit();
          }
        }
      }
      layerConfigIndex++;
    }

    progressBar.stop();
            writeMetaData(JSON.stringify(metadataList, null, 2));
  };
  module.exports = { startCreating, buildSetup, getElements };
