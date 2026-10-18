/** Server-only, original fiction. Never import this module into the browser bundle. */
export const puzzle = {
  id: 'the-tideglass-transfer',
  title: 'The Tideglass Transfer',
  subtitle: 'A missing exhibit. Six records. One account that fits.',
  introduction: 'It is the morning before a small museum opens. The Tideglass, a hand-built wooden model of the tides, is missing from its display. Nothing has been broken into and nobody is in danger. Find who moved it, where it went, and why. All four characters are fictional adults.',
  rooms: [
    { id: 'gallery', name: 'Gallery', description: 'Morning light falls across a display plinth. A condition-card holder stands beside it. Curator Elin and guide Owen are preparing the visitor route.' },
    { id: 'archive', name: 'Archive', description: 'The registrar’s desk holds a transfer ledger. Priya keeps the museum’s object movements in order.' },
    { id: 'workshop', name: 'Conservation workshop', description: 'A quiet workspace with labelled benches and a bench register. Mateo is checking the morning conservation schedule.' },
  ],
  characters: [
    { id: 'elin', name: 'Elin Moss', role: 'Curator', roomId: 'gallery', reply: 'Elin says: “Let the records lead. Start at the empty display, then follow any transfer reference you find.”' },
    { id: 'owen', name: 'Owen Reed', role: 'Gallery guide', roomId: 'gallery', reply: 'Owen says: “I prepare the visitor route. I cannot verify an object transfer from memory; the written records will be more useful.”' },
    { id: 'priya', name: 'Priya Das', role: 'Registrar', roomId: 'archive', reply: 'Priya says: “Find the transfer record and check its destination before asking me to reconcile them.”' },
    { id: 'mateo', name: 'Mateo Vale', role: 'Conservator', roomId: 'workshop', reply: 'Mateo says: “Bring me the condition card and the signed transfer reference so we can discuss the same event.”' },
  ],
  targets: [
    { id: 'display-plinth', roomId: 'gallery', name: 'Display plinth', clueId: 'transfer-tab' },
    { id: 'condition-holder', roomId: 'gallery', name: 'Condition-card holder', clueId: 'condition-card' },
    { id: 'transfer-ledger', roomId: 'archive', name: 'Transfer ledger', clueId: 'signed-transfer' },
    { id: 'bench-register', roomId: 'workshop', name: 'Bench register', clueId: 'bench-location' },
  ],
  clues: [
    { id: 'transfer-tab', title: 'The transfer tab', source: 'Gallery · display plinth', requires: [] as string[], text: 'A blue tab on the empty Tideglass plinth reads: “Object movement T-17. Consult the condition card and transfer ledger.”' },
    { id: 'condition-card', title: 'The condition card', source: 'Gallery · condition-card holder', requires: ['transfer-tab'], text: 'The Tideglass condition card, logged at 08:55, says: “Mounting thread is fraying. Move the model onto padded support before another demonstration.”' },
    { id: 'signed-transfer', title: 'The signed transfer', source: 'Archive · transfer ledger', requires: ['transfer-tab'], text: 'Entry T-17 records the Tideglass leaving the gallery at 09:05. It is signed “M. Vale”; its destination is “Bench B” and its return is planned before opening.' },
    { id: 'bench-location', title: 'The bench location', source: 'Conservation workshop · bench register', requires: ['signed-transfer'], text: 'The bench register places Bench B in the conservation workshop. Its occupied padded cradle is labelled “Tideglass / T-17”.' },
    { id: 'conservator-account', title: 'The conservator’s account', source: 'Conservation workshop · Mateo Vale', requires: ['condition-card', 'signed-transfer'], text: 'Mateo Vale says: “I signed T-17 and moved the Tideglass onto the padded bench because its mounting thread was fraying. I wanted to protect it before another demonstration.”' },
    { id: 'registrar-check', title: 'The registrar’s cross-check', source: 'Archive · Priya Das', requires: ['signed-transfer', 'bench-location'], text: 'Priya Das says: “The M. Vale signature belongs to Mateo. I checked the workshop cradle against T-17: it is the same Tideglass. This is a protective conservation transfer, not a visitor-route change.”' },
  ],
  witnessClues: { mateo: 'conservator-account', priya: 'registrar-check' } as Record<string, string>,
  reasons: [
    { id: 'visitor-route', label: 'Rearrange the visitor route' },
    { id: 'protect-thread', label: 'Protect the fraying mounting thread' },
    { id: 'photograph', label: 'Prepare an exhibition photograph' },
  ],
  solution: { actorId: 'mateo', placeId: 'workshop', reasonId: 'protect-thread' },
  solvedText: 'The records agree: Mateo Vale moved the Tideglass to the conservation workshop to protect its fraying mounting thread. The model is safe on padded support, and its return was planned before opening. Case resolved through the six recorded clues.',
} as const;

export type ClueDefinition = (typeof puzzle.clues)[number];
