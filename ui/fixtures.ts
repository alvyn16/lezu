// Demonstration data only. Session values are samples, never an installed-library scan.
import type { Game } from './domain/models';

export const games: Game[] = [
  { id: 'alan', title: 'Alan Wake II', source: 'epic', installed: true, played: '1 h', lastPlayed: 'Today', size: null,
    developer: 'Remedy Entertainment', year: '2023', tags: ['Survival horror', 'Single-player'],
    description: 'Follow two protagonists through a psychological horror story where fiction reshapes reality.',
    theme: { page: '#a91740', sidebar: '#71142e' }, screenshots: ['alan-screen.png'], cover: 'alan-cover.png', hero: 'alan-hero.webp', logo: 'alan-logo.png' },
  { id: 'sifu', title: 'Sifu', source: 'epic', installed: true, played: '0 h', lastPlayed: 'Today', size: null,
    developer: 'Sloclap', year: '2022', tags: ['Single-player', 'Martial arts', 'Action'],
    description: 'Master close-quarters Kung Fu combat on a journey of revenge. Learn from each defeat as your character ages with every return.',
    theme: { page: '#a32213', sidebar: '#6b1b19' }, screenshots: ['sifu-screen-0.jpg', 'sifu-screen-1.jpg'], cover: 'sifu-cover.jpg', hero: 'sifu-hero.jpg', logo: 'sifu-logo.png' },
  { id: 'witcher', title: 'The Witcher 3: Wild Hunt — Complete Edition', source: 'gog', installed: true, played: '4 h', lastPlayed: 'Yesterday', size: null,
    developer: null, year: null, tags: ['Role-playing'], description: null,
    theme: { page: '#244954', sidebar: '#19353c' }, screenshots: [], cover: 'witcher-cover.jpg', hero: 'witcher-hero.jpg', logo: 'witcher-logo.png' },
  { id: 'hearts', title: 'Hearts of Iron IV', source: 'steam', installed: true, played: '25 h', lastPlayed: 'Yesterday', size: null,
    developer: null, year: null, tags: ['Strategy'], description: null,
    theme: { page: '#66502d', sidebar: '#493924' }, screenshots: [], cover: 'hearts-cover.jpg', hero: 'hearts-hero.jpg', logo: 'hearts-logo.png' },
  { id: 'elden', title: 'ELDEN RING', source: 'steam', installed: true, played: '12 h', lastPlayed: 'Last week', size: null,
    developer: null, year: null, tags: ['Role-playing'], description: null,
    theme: { page: '#3c514b', sidebar: '#273b35' }, screenshots: [], cover: 'elden-cover.jpg', hero: 'elden-hero.jpg', logo: 'elden-logo.png' },
  { id: 'balatro', title: 'Balatro', source: 'steam', installed: true, played: '3 h', lastPlayed: 'Last week', size: null,
    developer: null, year: null, tags: ['Cards'], description: null,
    theme: { page: '#8b281e', sidebar: '#602018' }, screenshots: [], cover: 'balatro-cover.jpg', hero: 'balatro-hero.jpg', logo: 'balatro-logo.png' },
  { id: 'devil', title: 'Devil May Cry 5', source: 'steam', installed: false, played: '2 h', lastPlayed: 'Last month', size: null,
    developer: null, year: null, tags: ['Action'], description: null,
    theme: { page: '#2c415a', sidebar: '#1c2c41' }, screenshots: [], cover: 'devil-cover.jpg', hero: 'devil-hero.jpg', logo: 'devil-logo.png' },
  { id: 'missing', title: 'A game waiting for artwork', source: 'gog', installed: false, played: null, lastPlayed: null, size: null,
    developer: null, year: null, tags: [], description: null,
    theme: { page: '#30343b', sidebar: '#23272d' }, screenshots: [], cover: null, hero: null, logo: null },
];
export const asset = (name: string | null): string => name ? `assets/${name}` : '';
