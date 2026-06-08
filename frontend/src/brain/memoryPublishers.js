// frontend/src/brain/memoryPublishers.js
// Thin normalizers so engine call-sites don't depend on bus message shape.
export const publishOutcome    = (bus, payload) => bus.emit({ stage: 'eval', payload })
export const publishReflection = (bus, payload) => bus.emit({ stage: 'reflector', payload })
export const publishCuration   = (bus, payload) => bus.emit({ stage: 'curator', payload })
export const publishAnalysis   = (bus, payload) => bus.emit({ stage: 'bullet', payload })
