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

// Apply Exclusion Rules Function
const applyExclusionRules = (selectedTraits, rules, results) => {
 // console.log(`selected traits: ${JSON.stringify(selectedTraits)}`);
 // console.log(`exclude rules: ${JSON.stringify(rules.excludeRules)}`);
  for (const [layerName, traitRules] of Object.entries(rules.excludeRules)) {
    console.log(`layerName: ${layerName}`);
    let selectedTrait = selectedTraits[layerName];
    // if und
    if (selectedTrait.indexOf('_') > -1) {
      selectedTrait = selectedTrait.split('_')[0].toLowerCase().trim();
    }
      // make every other word start with a capital letter
      selectedTrait = selectedTrait.replace(/\b\w/g, char => char.toUpperCase());
    
    console.log(`selectedTrait: ${selectedTrait}`);
    if (selectedTrait && traitRules[selectedTrait]) {
      const exclusions = traitRules[selectedTrait].exclude;
      console.log(`exclusions: ${JSON.stringify(exclusions)}`);
      if (exclusions) {
      for (const [excludeLayer, excludeTraits] of Object.entries(exclusions)) {
        if (excludeTraits.includes('All')) {
          // Exclude all traits in the target layer by setting them to null
          const layer = results.find(r => r.name.toLowerCase() === excludeLayer.toLowerCase());
          if (layer) {
            layer.selectedElement = null; // Assuming 'None' is handled in metadata
            console.log(`Excluded all traits from ${excludeLayer} due to selecting "${selectedTrait}" in ${layerName}`);
          }
        } else {
          // Exclude specific traits
          const layer = results.find(r => r.name.toLowerCase() === excludeLayer.toLowerCase());
          if (layer && layer.selectedElement && excludeTraits.includes(layer.selectedElement.name)) {
            console.log(`Excluding ${layer.selectedElement.name} from ${excludeLayer} due to selecting "${selectedTrait}" in ${layerName}`);
            layer.selectedElement = null; // Assuming 'None' is handled in metadata
          }
        }
      }
    }
    } else {
      console.log(`No exclusions found for ${layerName}`);
      console.log(traitRules);
    }
  }
};

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
  const withoutOptions = removeQueryStrings(_str);
  var dna = Number(withoutOptions.split(":").shift());
  return dna;
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
        // Nose can have 2 or 3 parts: Nose, Skin, Size (optional)
        if (parts.length === 3) {
          skin = parts[0].toLowerCase();
          size = parts[1].toLowerCase();
        } else if (parts.length === 2) {
          skin = parts[0].toLowerCase();
          // Size remains null
        }
      } else if (layerName.toLowerCase() === 'hair' || layerName.toLowerCase() === 'beard') {
        // Hair and Beard have 1 or 2 parts: Hair_Color or Beard_Color
        if (parts.length === 2) {
          color = parts[1].toLowerCase();
        }
        // If parts.length === 1, it might be 'None' or a default trait
        
      }

      // Add console logs for debugging
      if (['accessories', 'nose', 'hair', 'beard'].includes(layerName.toLowerCase())) {
        console.log(`Parsed ${layerName}:`, {
          accessoryName,
          shirt,
          skin,
          size,
          color
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
  if (_element.layer.name.toLowerCase() === 'accessories' && !_element.layer.selectedElement) {
    // Add an attribute for "No Accessories"
    attributesList.push({
      trait_type: _element.layer.name,
      value: "None",
    });
    return;
  }

  if (_element.layer.name.toLowerCase() === 'beard' && !_element.layer.selectedElement) {
    // Add an attribute for "No Beard"
    attributesList.push({
      trait_type: _element.layer.name,
      value: "None",
    });
    return;
  }

  if (_element.layer.name.toLowerCase() === 'hair' && !_element.layer.selectedElement) {
    // Add an attribute for "No Hair"
    attributesList.push({
      trait_type: _element.layer.name,
      value: "None",
    });
    return;
  }

  // Handle other layers if needed
  // Example for Glasses:
  if (_element.layer.name.toLowerCase() === 'glasses' && !_element.layer.selectedElement) {
    // Add an attribute for "No Glasses"
    attributesList.push({
      trait_type: _element.layer.name,
      value: "None",
    });
    return;
  }

  let selectedElement = _element.layer.selectedElement;
  attributesList.push({
    trait_type: _element.layer.name,
    value: selectedElement.name,
  });
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
  let mappedDnaToLayers = _layers.map((layer, index) => {
    let selectedElement = layer.elements.find(
      (e) => e.id == cleanDna(_dna.split(DNA_DELIMITER)[index])
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
  const query = /(\?.*$)/;
  return _dna.replace(query, "");
};

// Check if DNA is unique
const isDnaUnique = (_DnaList = new Set(), _dna = "") => {
  const _filteredDNA = filterDNAOptions(_dna);
  return !_DnaList.has(_filteredDNA);
};

// Create DNA string
const createDna = (_layers) => {
  let randNum = [];
  _layers.forEach((layer) => {
    var totalWeight = 0;
    layer.elements.forEach((element) => {
      totalWeight += element.weight;
    });
    // Number between 0 - totalWeight
    let random = Math.floor(Math.random() * totalWeight);
    for (var i = 0; i < layer.elements.length; i++) {
      // Subtract the current weight from the random weight until we reach a sub zero value.
      random -= layer.elements[i].weight;
      if (random < 0) {
        return randNum.push(
          `${layer.elements[i].id}:${layer.elements[i].filename}${
            layer.bypassDNA ? "?bypassDNA=true" : ""
          }`
        );
      }
    }
  });
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
    const shirtTraits = getShirtTraits();

    const layers = layersSetup(
      layerConfigurations[layerConfigIndex].layersOrder,
      shirtTraits
    );

    while (
      editionCount <= layerConfigurations[layerConfigIndex].growEditionSizeTo
    ) {
      let newDna = createDna(layers);
    
      if (isDnaUnique(dnaList, newDna)) {
        let results = constructLayerToDna(newDna, layers);
        let loadedElements = [];

        // Extract Skin, Shirt, Hair traits
        const selectedSkin = results.find(r => r.name.toLowerCase() === 'skin')?.selectedElement?.name.toLowerCase();
        const selectedShirt = results.find(r => r.name.toLowerCase() === 'shirt')?.selectedElement?.name.toLowerCase();
        const selectedHair = results.find(r => r.name.toLowerCase() === 'hair')?.selectedElement?.name.toLowerCase();
        const selectedNose = results.find(r => r.name.toLowerCase() === 'nose')?.selectedElement?.name.toLowerCase();
        const selectedMouth = results.find(r => r.name.toLowerCase() === 'mouth')?.selectedElement?.name.toLowerCase();
        const selectedGlasses = results.find(r => r.name.toLowerCase() === 'glasses')?.selectedElement?.name.toLowerCase();
        const selectedHat = results.find(r => r.name.toLowerCase() === 'hat')?.selectedElement?.name.toLowerCase();
        const selectedAccessory = results.find(r => r.name.toLowerCase() === 'accessories')?.selectedElement?.name.toLowerCase();
        const selectedBeard = results.find(r => r.name.toLowerCase() === 'beard')?.selectedElement?.name.toLowerCase();
        const selectedPowerUp = results.find(r => r.name.toLowerCase() === 'power up')?.selectedElement?.name.toLowerCase();
        console.log(`Edition ${abstractedIndexes[0]}: Skin = ${selectedSkin}, Shirt = ${selectedShirt}, Hair = ${selectedHair}, Nose = ${selectedNose}, Mouth = ${selectedMouth}, Glasses = ${selectedGlasses}, Hat = ${selectedHat}, Accessory = ${selectedAccessory}, Beard = ${selectedBeard}, PowerUp = ${selectedPowerUp}`);

        if (!selectedSkin || !selectedShirt) {
          console.error(`Missing Skin or Shirt trait for edition ${abstractedIndexes[0]}`);
          failedCount++;
          if (failedCount >= uniqueDnaTorrance) {
            console.log(
              `You need more layers or elements to grow your edition to ${layerConfigurations[layerConfigIndex].growEditionSizeTo} artworks!`
            );
            process.exit();
          }
          continue;
        }

        // Extract Eyes trait
// Extract Eyes trait without converting to lowercase
const selectedEyes = results.find(r => r.name.toLowerCase() === 'eyes')?.selectedElement?.name;
// for each layer in layers, add the
let selectedTraits = {
  Eyes: selectedEyes,
  Skin: selectedSkin,
  Shirt: selectedShirt,
  Hair: selectedHair,
  Nose: selectedNose,
  Mouth: selectedMouth,
  Glasses: selectedGlasses,
  Hat: selectedHat,
  Accessory: selectedAccessory,
  Beard: selectedBeard,

};

// go through each selectedTrait, if it is undefined, set it to none
for (const trait in selectedTraits) {
  if (selectedTraits[trait] === undefined) {
    selectedTraits[trait] = 'none';
  }
}
console.log(selectedTraits);
// make sure selectedTraits objects are all names in layers


// Apply Exclusion Rules

        // Apply Exclusion Rules
        applyExclusionRules(selectedTraits, rules, results);

        // After applying exclusion rules, re-extract any affected traits if necessary
        // For example, Glasses may have been set to null
        // If needed, handle additional logic here

        // Filter Accessories based on Skin and Shirt
        const accessoriesLayer = results.find(r => r.name.toLowerCase() === 'accessories');
        if (accessoriesLayer) {
          const accessoriesElements = layers.find(l => l.name.toLowerCase() === 'accessories').elements;

          // Filter accessories that match the selected Skin and Shirt or are universally compatible
          const matchingAccessories = accessoriesElements.filter(
            accessory =>
              (accessory.skin === selectedSkin && accessory.shirt === selectedShirt) || // Match both
              (accessory.skin === selectedSkin && accessory.shirt === "base")  || 
              (accessory.skin === null && accessory.shirt === selectedShirt) ||
              (accessory.skin === null && accessory.shirt === null)

          );

          console.log("Matching Accessories:", matchingAccessories.map(a => a.name));

          if (matchingAccessories.length > 0) {
            // Select a random accessory from the filtered list
            const randomAccessory = matchingAccessories[Math.floor(Math.random() * matchingAccessories.length)];
            accessoriesLayer.selectedElement = randomAccessory;
            console.log(`Selected Accessory: ${randomAccessory.name}`);
          } else {
            // Optionally, handle cases where no accessory matches the traits
            accessoriesLayer.selectedElement = null; // No accessory
            console.log(`No matching accessory found for Edition ${abstractedIndexes[0]}`);
          }
        }

        // Filter Beard based on Hair
        const beardLayer = results.find(r => r.name.toLowerCase() === 'beard');
        if (beardLayer) {
          const beardElements = layers.find(l => l.name.toLowerCase() === 'beard').elements;
        //  console.log(beardElements);
         // console.log("selectedHair", selectedHair);
         console.log("selectedHair", selectedHair);
          if (selectedHair && selectedHair !== 'none') {
            // Get color of hair
            const hairColor = selectedHair.split('_')[1];
            // Beard color must match Hair color or be 'None'
            const matchingBeards = beardElements.filter(
              beard => beard.color === hairColor || beard.color === 'none'
            );
          //  console.log("matchingBeards for color ", hairColor, matchingBeards);

            //console.log("Matching Beards:", matchingBeards.map(b => b.name));

            if (matchingBeards.length > 0) {
              // Select a random beard from the filtered list
              const randomBeard = matchingBeards[Math.floor(Math.random() * matchingBeards.length)];
              beardLayer.selectedElement = randomBeard;
              console.log(`Selected Beard: ${randomBeard.name}`);
            } else {
              // No matching beard found; set to 'None'
              beardLayer.selectedElement = beardElements.find(b => b.color === 'none') || null;
              console.log(`No matching beard found for Edition ${abstractedIndexes[0]}. Set to 'None'`);
            }
          } else {
            // If no Hair, we can use any beard
            const noHairBeards = beardElements.filter(b => b.color !== 'none');
            const randomNoHairBeard = noHairBeards[Math.floor(Math.random() * noHairBeards.length)];
            beardLayer.selectedElement = randomNoHairBeard;
            console.log(`No Hair selected. Random Beard: ${randomNoHairBeard.name}`);
          }
        }

        // Filter Nose based on Skin
        const noseLayer = results.find(r => r.name.toLowerCase() === 'nose');
        if (noseLayer) {
          const noseElements = layers.find(l => l.name.toLowerCase() === 'nose').elements;

          // Filter noses that match the selected Skin or have no Skin dependency
          const matchingNoses = noseElements.filter(
            nose => nose.skin === selectedSkin || nose.skin === null
          );

         // console.log("Matching Noses:", matchingNoses.map(n => n.name));

          if (matchingNoses.length > 0) {
            // Select a random nose from the filtered list
            const randomNose = matchingNoses[Math.floor(Math.random() * matchingNoses.length)];
            noseLayer.selectedElement = randomNose;
            console.log(`Selected Nose: ${randomNose.name}`);
          } else {
            // Optionally, handle cases where no nose matches the traits
            noseLayer.selectedElement = null; // No nose
            console.log(`No matching nose found for Edition ${abstractedIndexes[0]}`);
          }
        }

        // Load all elements including the filtered accessory, beard, and potentially excluded traits
        results.forEach((layer) => {
          if (
            (layer.name.toLowerCase() === 'accessories' ||
              layer.name.toLowerCase() === 'beard' ||
              layer.name.toLowerCase() === 'nose' ||
              layer.name.toLowerCase() === 'glasses') && // Include Glasses for exclusion handling
            layer.selectedElement
          ) {
            loadedElements.push(loadLayerImg(layer));
          } else if (
            layer.name.toLowerCase() !== 'accessories' &&
            layer.name.toLowerCase() !== 'beard' &&
            layer.name.toLowerCase() !== 'nose' &&
            layer.name.toLowerCase() !== 'glasses' // Exclude Glasses unless selected
          ) {
            loadedElements.push(loadLayerImg(layer));
          }
        });

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
