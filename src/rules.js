// src/rules.js

module.exports = {
  excludeRules: {
    Eyes: {
      'Blue Lazer': {
        exclude: {
          Glasses: ['All'], // Exclude all Glasses when Laser Eyes are selected
        },
      },
      'Red Lazer': {
        exclude: {
          Glasses: ['All'], // Exclude all Glasses when Laser Eyes are selected
        },
      },
    }
    // Add more layer rules as needed
  }
};
