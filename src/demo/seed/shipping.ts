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
      name: 'Small Shell Box',
      lengthIn: 8,
      widthIn: 6,
      heightIn: 3,
      defaultWeightLb: 1,
      createdAt: '2026-02-20T00:00:00.000Z',
      updatedAt: '2026-02-20T00:00:00.000Z',
    },
    {
      id: 'seed_box_002',
      name: 'Gift Set Box',
      lengthIn: 12,
      widthIn: 10,
      heightIn: 5,
      defaultWeightLb: 2,
      createdAt: '2026-02-20T00:00:00.000Z',
      updatedAt: '2026-02-20T00:00:00.000Z',
    },
  ],
};
