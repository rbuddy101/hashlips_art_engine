const express = require('express');
const app = express();
const port = 3002;

const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

// Make the layers folder static
app.use('/comp_layers', express.static(path.join(__dirname, 'comp_layers')));

app.set('trust proxy', true);

app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(express.json());
app.use(bodyParser.json({
    limit: '50mb'
}));
app.use(bodyParser.urlencoded({
    limit: '50mb',
    extended: true,
    parameterLimit: 10000000
}));

app.set('view engine', 'ejs');

app.get('/', (req, res) => {
    const layersDataPath = path.join(__dirname, 'layers_data.json');
    fs.readFile(layersDataPath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading layers_data.json:', err);
            return res.status(500).send('Internal Server Error');
        }
        const layersData = JSON.parse(data);
        res.render('rarities', { layers: layersData });
    });
});

// New POST endpoint to handle rarity updates
app.post('/update-rarities', (req, res) => {
    const updatedTraits = req.body.traits; // Expecting an array of updated traits

    if (!Array.isArray(updatedTraits)) {
        return res.status(400).json({ message: 'Invalid data format. Expected an array of traits.' });
    }

    const layersDataPath = path.join(__dirname, 'layers_data.json');

    // Read the existing layers_data.json
    fs.readFile(layersDataPath, 'utf8', (readErr, data) => {
        if (readErr) {
            console.error('Error reading layers_data.json:', readErr);
            return res.status(500).json({ message: 'Internal Server Error' });
        }

        let layersData;
        try {
            layersData = JSON.parse(data);
        } catch (parseErr) {
            console.error('Error parsing layers_data.json:', parseErr);
            return res.status(500).json({ message: 'Internal Server Error' });
        }

        // Iterate over updatedTraits and update layersData accordingly
        updatedTraits.forEach(updated => {
            const { category, name, rarity } = updated;

            if (!category || !name || typeof rarity !== 'number') {
                // Skip invalid entries
                return;
            }

            if (layersData[category]) {
                // Find the trait by name
                const trait = layersData[category].find(t => t.name === name);

                if (trait) {
                    trait.rarity = rarity;
                    trait.edited = true; // Mark as edited
                }
            }
        });

        // Write the updated layersData back to layers_data.json
        fs.writeFile(layersDataPath, JSON.stringify(layersData, null, 2), 'utf8', (writeErr) => {
            if (writeErr) {
                console.error('Error writing to layers_data.json:', writeErr);
                return res.status(500).json({ message: 'Internal Server Error' });
            }

            return res.json({ message: 'Rarities updated successfully.' });
        });
    });
});

// Run Express
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
