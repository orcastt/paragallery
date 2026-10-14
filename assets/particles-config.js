window.PARTICLE_CONFIG = {
  // Public model paths, keyed by the project ID in manifest.json.
  // Example: '20240710-vase': { src: 'models/vase.glb', rotation: [0, 0, 0] }
  models: {},
  pointCount: 160000,
  mobilePointCount: 64000,
  source: 'inferred', // Individually modeled from inspected artwork plates.
  voyageSpeed: 2.2,     // World units per second; about one exhibit every 14 seconds.
  // Exclude title/signature margins in the published portfolio plates.
  imageCrop: [0, 0.07, 1, 0.86],
};
