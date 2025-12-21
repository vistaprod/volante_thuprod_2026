import { showPopup } from './utils.js';

export function loadFromStorage(key, defaultValue) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.error(`Error cargando ${key}:`, e);
    showPopup(`⚠️ Error cargando ${key}`, 'error');
    return defaultValue;
  }
}

export function saveToStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error(`Error guardando ${key}:`, e);
    if (e.name === 'QuotaExceededError') {
      showPopup('⚠️ Almacenamiento lleno. Libera espacio.', 'error');
    } else {
      showPopup(`⚠️ Error guardando datos`, 'error');
    }
    return false;
  }
}

export function migrateHistorial() {
  const historial = loadFromStorage('historialCompleto', []);
  if (historial.length === 0) {
    return;
  }

  const porFecha = historial.reduce((acc, l) => {
    if (!acc[l.fecha]) {
      acc[l.fecha] = [];
    }
    acc[l.fecha].push(l);
    return acc;
  }, {});

  for (const fecha in porFecha) {
    saveToStorage(`log-${fecha}`, porFecha[fecha]);
  }

  localStorage.removeItem('historialCompleto');
  localStorage.setItem('historialMigrado', 'true');
  console.log('Migración de historial completada.');
}

export function exportData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    data[key] = localStorage.getItem(key);
  }
  return data;
}

export function importData(jsonData) {
  try {
    const data = JSON.parse(jsonData);
    if (!data || typeof data !== 'object') {
      throw new Error('Formato inválido');
    }

    // Clear current data? Maybe risky, but necessary for clean restore.
    // Ideally we backup first, but for now we just import.
    // localStorage.clear(); // Optional: Clear before import to remove old junk

    Object.keys(data).forEach(key => {
      localStorage.setItem(key, data[key]);
    });
    return true;
  } catch (e) {
    console.error('Error importando datos:', e);
    return false;
  }
}