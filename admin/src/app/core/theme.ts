import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/** Aura, dark, with the storefront's accent red (#E10600) as primary. */
export const GearDoctorTheme = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#fff1f0', 100: '#ffdcd9', 200: '#ffb8b3', 300: '#ff8a82', 400: '#ff4f45',
      500: '#e10600', 600: '#c00500', 700: '#9d0400', 800: '#7a0300', 900: '#5c0200', 950: '#3a0100',
    },
    colorScheme: {
      dark: {
        surface: {
          0: '#ffffff', 50: '#f5f5f7', 100: '#d9d9de', 200: '#b5b5bd', 300: '#8a8a93', 400: '#5e5e66',
          500: '#3a3a42', 600: '#26262c', 700: '#1c1c21', 800: '#141418', 900: '#0f0f12', 950: '#0a0a0c',
        },
      },
    },
  },
});
