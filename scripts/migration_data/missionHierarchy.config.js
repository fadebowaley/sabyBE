const divisionKeywords = [
  ' DIVISION',
  ' DIV.',
  ' REGION',
  'NATIONAL MISSION',
  'INTERNATIONAL REGION',
  'NATIONAL MISSION',
  'NATIONAL REGION',
  'MISSION (GLOBAL',
];

const dioceseKeywords = [
  'DIOCESE',
  'DIO.',
  'DIO ',
  ' DIO.',
  ' DIO ',
  ' DIO-',
  ' DIO–',
  ' DIOCE',
  ' DIOCE.',
];

const zoneKeywords = [
  'HEADQUARTERS',
  'ZONE',
  'CENTRE',
  'CENTER',
  'DISTRICT',
  'AREA',
  'MISSION FIELD',
  'MISSION HOUSE',
  'MISSION HUB',
  'MISSION',
  'PARISH HQ',
];

const titleMappings = [
  { match: /^snr\.?\s+pastor/i, canonical: 'Senior Pastor' },
  { match: /^senior\s+pastor/i, canonical: 'Senior Pastor' },
  { match: /^pastor\s+\(mrs\.\)/i, canonical: 'Pastor' },
  { match: /^pastor\s+\(mr\.\)/i, canonical: 'Pastor' },
  { match: /^pastor\s+\(dr\.\)/i, canonical: 'Pastor' },
  { match: /^pastor/i, canonical: 'Pastor' },
  { match: /^minister/i, canonical: 'Minister' },
  { match: /^deaconess/i, canonical: 'Deaconess' },
  { match: /^deacon/i, canonical: 'Deacon' },
  { match: /^elder/i, canonical: 'Elder' },
  { match: /^missionary/i, canonical: 'Missionary' },
  { match: /^brother/i, canonical: 'Brother' },
  { match: /^sister/i, canonical: 'Sister' },
  { match: /^bishop/i, canonical: 'Bishop' },
  { match: /^dr\./i, canonical: 'Pastor' },
];

module.exports = {
  rootNodeName: 'National Headquarters',
  levelOrder: ['Root', 'Division', 'Diocese', 'Zone', 'Parish'],
  structures: {
    Root: { name: 'Root Structure', type: 'headquarters' },
    Division: { name: 'Division Structure', type: 'division' },
    Diocese: { name: 'Diocese Structure', type: 'region' },
    Zone: { name: 'Zone Structure', type: 'zone' },
    Parish: { name: 'Parish Structure', type: 'branch' },
  },
  divisionKeywords,
  dioceseKeywords,
  zoneKeywords,
  titleMappings,
  fallbackPassword: 'H@lopa55word',
};


