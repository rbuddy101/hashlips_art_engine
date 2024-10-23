const basePath = process.cwd();
const { NETWORK } = require(`${basePath}/constants/network.js`);
const rules = require(`${basePath}/src/rules.js`); // Import the rules

const fs = require("fs");
const sha1 = require(`${basePath}/node_modules/sha1`);
const { createCanvas, loadImage } = require(`${basePath}/node_modules/canvas`);
const buildDir = `${basePath}/build`;
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

let hashlipsGiffer = null;



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

// Function to extract Shirt traits
const getShirtTraits = () => {
  const shirtLayerPath = `${layersDir}/Shirt/`;
  if (!fs.existsSync(shirtLayerPath)) {
    throw new Error(`Shirt layer folder not found at path: ${shirtLayerPath}`);
  }
  return fs
    .readdirSync(shirtLayerPath)
    .filter((item) => !/(^|\/)\.[^\/\.]/g.test(item))
    .map((i) => cleanName(i).toLowerCase());
};

// Updated getElements function to handle multiple layers with different trait dependencies
const getElements = (path, layerName, shirtTraits = []) => {
  return fs
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

      // Add console logs for debugging
      if (['beard'].includes(layerName.toLowerCase())) {
        console.log(`Parsed ${layerName}:`, {
          accessoryName,
          shirt,
          skin,
          size,
          color,
          rarity: getRarityWeight(i)
        });
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

// Save generated image
const saveImage = (_editionCount) => {
  fs.writeFileSync(
    `${buildDir}/images/${_editionCount}.png`,
    canvas.toBuffer("image/png")
  );
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
  const selectedElement = _element.layer.selectedElement;

  // Define layers that should have a "None" attribute when no trait is selected
  const layersWithNone = ['accessories', 'beard', 'hair', 'glasses', 'necklace'];

  if (layersWithNone.includes(layerName) && !selectedElement) {
    attributesList.push({
      trait_type: _element.layer.name,
      value: "None",
    });
    return;
  }

  // Handle other layers if needed (e.g., Glasses as provided)
  if (layerName === 'glasses' && !selectedElement) {
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

// Load layer image
const loadLayerImg = async (_layer) => {
  try {
    if (_layer.selectedElement) {
      console.log(`Loading image for ${_layer.name}: ${_layer.selectedElement.filename}`);
      const image = await loadImage(`${_layer.selectedElement.path}`);
      return { layer: _layer, loadedImage: image };
    } else {
      console.log(`No image to load for ${_layer.name}`);
      return null; // No image to load
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
  if (_renderObject === null) return; // Skip if no image to draw

  ctx.globalAlpha = _renderObject.layer.opacity;
  ctx.globalCompositeOperation = _renderObject.layer.blend;

  text.only
    ? addText(
        `${_renderObject.layer.name}${text.spacer}${_renderObject.layer.selectedElement.name}`,
        text.xGap,
        text.yGap * (_index + 1),
        text.size
      )
    : ctx.drawImage(
        _renderObject.loadedImage,
        0,
        0,
        format.width,
        format.height
      );

  addAttributes(_renderObject);
};

// Map DNA to layers
const constructLayerToDna = (_dna = "", _layers = []) => {
  if (!_dna) {
    console.error("DNA is undefined or null in constructLayerToDna");
    return [];
  }
  let mappedDnaToLayers = _layers.map((layer, index) => {
    console.log("Layer:", layer.name);
    let dnaSegment = _dna.split(DNA_DELIMITER)[index];
    console.log("DNA Segment:", dnaSegment);
    if (!dnaSegment) {
      console.error(`DNA segment is missing for layer ${layer.name}`);
      return {
        name: layer.name,
        blend: layer.blend,
        opacity: layer.opacity,
        selectedElement: null,
      };
    }
    let selectedElement = layer.elements.find(
      (e) => e.id == cleanDna(dnaSegment)
    );
    return {
      name: layer.name,
      blend: layer.blend,
      opacity: layer.opacity,
      selectedElement: selectedElement,
    };
  });
  return mappedDnaToLayers;
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
    }, []);

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
    if (layerName.toLowerCase() === currentLayer.name.toLowerCase()) {
      continue;
    }

    const layerRules = rules.excludeRules[layerName];
    if (!layerRules) {
      console.warn(`No exclusion rules found for layer "${layerName}"`);
      continue;
    }

    if (layerRules[traitName]) {
      const exclude = layerRules[traitName].exclude;
      if (exclude && exclude[currentLayer.name]) {
        exclusions.push(...exclude[currentLayer.name]);
        console.log(`Excluding traits from layer "${currentLayer.name}" based on trait "${traitName}" in layer "${layerName}":`, exclude[currentLayer.name]);
      }
    }

    if (traitName.includes('_')) {
      const traitPrefix = traitName.split('_')[0];
      const excludePrefix = layerRules[traitPrefix]?.exclude;
      if (excludePrefix && excludePrefix[currentLayer.name]) {
        exclusions.push(...excludePrefix[currentLayer.name]);
        console.log(`Excluding traits from layer "${currentLayer.name}" based on prefix "${traitPrefix}" in layer "${layerName}":`, excludePrefix[currentLayer.name]);
      }
    }
  }

  if (exclusions.length === 0) {
    return currentLayer;
  }

  const exclusionsNormalized = exclusions.map(trait => normalizeTrait(trait));
  console.log("Normalized exclusions for current layer:", exclusionsNormalized);

  if (exclusionsNormalized.includes('all')) {
    console.log(`Excluding all traits from layer "${currentLayer.name}" due to 'All' exclusion.`);
    // remove all elements except for the one name "None"
    currentLayer.elements = currentLayer.elements.filter(element => element.name === "None");
    return currentLayer;
  }

  currentLayer.elements = currentLayer.elements.filter(element => {
    const elementNormalized = normalizeTrait(element.name);
    const isExcluded = exclusionsNormalized.some(exclusion => elementNormalized.includes(exclusion));
    if (isExcluded) {
      console.log(`Excluding trait "${element.name}" from layer "${currentLayer.name}"`);
      return false;
    }
    return true;
  });

  if (currentLayer.elements.length === 0) {
    console.warn(`All traits have been excluded from layer "${currentLayer.name}".`);
  } else {
    console.log(`Layer "${currentLayer.name}" elements after exclusion:`, currentLayer.elements);
  }

  console.log("Current layer elements after filtering:", currentLayer.elements);
  return currentLayer;
};

// Create DNA string
const createDna = (_layers) => {
  let selectedTraits = {}; // Store selected traits for exclusion checks    
  let randNum = [];
  let skin = null;
  let shirt = null;
  let color = null;
  
  // Create a deep copy of the layers
  const layersCopy = JSON.parse(JSON.stringify(_layers));

  for (let layerIndex = 0; layerIndex < layersCopy.length; layerIndex++) {
    let layer = layersCopy[layerIndex];
    var totalWeight = 0;

    if (layer.name.toLowerCase() === 'beard') {
      console.log("Beard layer");
      layer.elements = layer.elements.filter(element => {
        if (element.name.includes('_')) {
          const colorFound = element.name.split('_')[1];
          return colorFound === color;
        }
        return true;
      });
    } else if (layer.name.toLowerCase() === 'accessories') {
      console.log("Accessories layer");
      console.log("Shirt:", shirt, "Skin:", skin);
      let usedNaked = false;
      let foundMatch = false;
      layer.elements = layer.elements.filter(element => {
        if (element.name.includes('_')) {
          const shirtFound = element.name.split('_')[1];
          const skinFound = element.name.split('_')[2];
          console.log("Shirt Found:", shirtFound, "Skin Found:", skinFound);
          if ((shirtFound === shirt) && skinFound === skin) {
            console.log("Accessory Match:", element.name);
            foundMatch = true;
            return true;
          } else if(skinFound === undefined && shirtFound === shirt) {
            console.log("Accessory Match No Skin:", element.name);
            foundMatch = true;
            return true;
          } else if (shirtFound === 'Naked' && skinFound === skin) {
            console.log("Accessory Match Naked:", element.name);
            usedNaked = true;
            return true;
          }
          return false;
        }
        return true;
      });
      if (!foundMatch && !usedNaked) {
        console.error("No matching accessory found for Edition");
      }
      if (foundMatch) {
        layer.elements = layer.elements.filter(element => element.name !== 'Naked');
      }
    } else if (layer.name.toLowerCase() === 'nose') {
      console.log("Nose layer");
      console.log("Nose Color:", skin);
      layer.elements = layer.elements.filter(element => element.name.split('_')[1] === skin);
    } else if (layer.name.toLowerCase() === 'glasses') {
      console.log("Glasses layer");
    }
    //console.log("Selected traits:", selectedTraits);
    layer = removeBlockedTraits(layer, selectedTraits);
    console.log("Layer elements after filtering:", layer.elements);
    layer.elements.forEach(element => {
      totalWeight += element.weight;
    });

    let random = Math.floor(Math.random() * totalWeight);
    console.log("Going through layer:", layer.name);
   // console.log("Layer elements:", layer.elements);

    for (let i = 0; i < layer.elements.length; i++) {
      random -= layer.elements[i].weight;
      if (random < 0) {
        if (layer.name.toLowerCase() === 'skin') {
          skin = layer.elements[i].name;
          console.log("Skin:", skin);
        }
        if (layer.name.toLowerCase() === 'shirt') {
          shirt = layer.elements[i].name;
          console.log("Shirt:", shirt);
        }
        if (layer.name.toLowerCase() === 'hair') {
          if (layer.elements[i].name.includes('_')) {
            color = layer.elements[i].name.split('_')[1];
          }
          console.log("Hair Color:", color);
        }
        if (layer.name.toLowerCase() === 'necklace') {
          console.log("Necklace in elements:", layer.elements[i].name);
        }
        console.log("Random:", random, "Layer:", layer.name, "Element:", layer.elements[i].name);
        selectedTraits[layer.name] = layer.elements[i].name;
      //  console.log("Selected traits:", selectedTraits);
        randNum.push(
          `${layer.elements[i].id}:${layer.elements[i].filename}${
            layer.bypassDNA ? "?bypassDNA=true" : ""
          }`
        );
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

// Save individual metadata files
const saveMetaDataSingleFile = (_editionCount) => {
  let metadata = metadataList.find((meta) => meta.edition == _editionCount);
  debugLogs
    ? console.log(
        `Writing metadata for ${_editionCount}: ${JSON.stringify(metadata)}`
      )
    : null;
  fs.writeFileSync(
    `${buildDir}/json/${_editionCount}.json`,
    JSON.stringify(metadata, null, 2)
  );
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

  debugLogs
    ? console.log("Editions left to create: ", abstractedIndexes)
    : null;

  while (layerConfigIndex < layerConfigurations.length) {
    // Extract Shirt traits once before setting up layers

    const layers = layersSetup(
      layerConfigurations[layerConfigIndex].layersOrder
    );

    while (
      editionCount <= layerConfigurations[layerConfigIndex].growEditionSizeTo
    ) {
      let newDna = createDna(layers);
      console.log("New DNA:", newDna);
      if (!newDna) {
        console.log(`Failed to create DNA for edition ${abstractedIndexes[0]}`);
        failedCount++;
        if (failedCount >= uniqueDnaTorrance) {
          console.log(
            `You need more layers or elements to grow your edition to ${layerConfigurations[layerConfigIndex].growEditionSizeTo} artworks!`
          );
          process.exit();
        }
        continue;
      }

      if (isDnaUnique(dnaList, newDna)) {
        let results = constructLayerToDna(newDna, layers);
        //console.log("Results:", results);
        let loadedElements = [];

        results.forEach((layer) => {
          loadedElements.push(loadLayerImg(layer));
        });
        //console.log("Results:", results);


        await Promise.all(loadedElements).then((renderObjectArray) => {
          debugLogs ? console.log("Clearing canvas") : null;
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
          renderObjectArray.forEach((renderObject, index) => {
            if (renderObject) { // Ensure the renderObject is not null
              drawElement(
                renderObject,
                index,
                layerConfigurations[layerConfigIndex].layersOrder.length
              );
              if (gif.export) {
                hashlipsGiffer.add();
              }
            }
          });
          if (gif.export) {
            hashlipsGiffer.stop();
          }
          debugLogs
            ? console.log("Editions left to create: ", abstractedIndexes)
            : null;
          saveImage(abstractedIndexes[0]);
          addMetadata(newDna, abstractedIndexes[0]);
          saveMetaDataSingleFile(abstractedIndexes[0]);
          console.log(
            `Created edition: ${abstractedIndexes[0]}, with DNA: ${sha1(
              newDna
            )}`
          );
        });
        dnaList.add(filterDNAOptions(newDna));
        editionCount++;
        abstractedIndexes.shift();
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
  writeMetaData(JSON.stringify(metadataList, null, 2));
};
module.exports = { startCreating, buildSetup, getElements };

