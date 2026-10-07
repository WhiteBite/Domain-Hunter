import { mount } from 'svelte';
import './ui/inter-subset.css';
import App from './App.svelte';

const app = mount(App, {
  target: document.getElementById('app')!,
});

if (location.protocol === 'https:' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href).catch(() => {
      // installability is best-effort; the app is fully functional without the SW
    });
  });
}

export default app;
