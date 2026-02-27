import type { DemoShippingState } from '../types';

export const seedShippingState: DemoShippingState = {
  shipFrom: {
    shipFromName: 'Mia Reynolds',
    shipFromCompany: 'Admin Demo',
    shipFromAddress1: '510 Bayfront Ave',
    shipFromAddress2: 'Suite 2',
    shipFromCity: 'Annapolis',
    shipFromState: 'MD',
    shipFromPostal: '21401',
    shipFromCountry: 'US',
    shipFromPhone: '+1 410-555-0009',
    updatedAt: '2026-02-20T00:00:00.000Z',
  },
  boxPresets: [
    {
      id: 'seed_box_001',
      name: 'Small',
      lengthIn: 8,
      widthIn: 6,
      heightIn: 4,
      defaultWeightLb: 1,
      createdAt: '2026-02-20T00:00:00.000Z',
      updatedAt: '2026-02-20T00:00:00.000Z',
    },
    {
      id: 'seed_box_002',
      name: 'Medium',
      lengthIn: 12,
      widthIn: 9,
      heightIn: 6,
      defaultWeightLb: 2.5,
      createdAt: '2026-02-20T00:00:00.000Z',
      updatedAt: '2026-02-20T00:00:00.000Z',
    },
    {
      id: 'seed_box_003',
      name: 'Large',
      lengthIn: 16,
      widthIn: 12,
      heightIn: 10,
      defaultWeightLb: 5,
      createdAt: '2026-02-20T00:00:00.000Z',
      updatedAt: '2026-02-20T00:00:00.000Z',
    },
  ],
};
