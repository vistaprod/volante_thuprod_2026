// import { CONFIG } from './config.js'; // Removed in favor of STATE.config

import { loadFromStorage, saveToStorage, migrateHistorial, exportData, importData } from './storage.js';

import { getJornadaLogica, showPopup, yyyyMmDd, parseDdMmYyyy } from './utils.js';

import { STATE } from './state.js';
import { renderAll, toggleTheme, cambiarVista, renderDistribucionHoras, renderGraficas, renderDashboard, renderLog, getColorPuesto } from './ui.js';
import { registerServiceWorker } from './registerServiceWorker.js';
import { API_KEY, APPS_SCRIPT_URL } from './secrets.js';

// Init PWA
registerServiceWorker();

// GOOGLE SHEETS CONFIG
const SPREADSHEET_ID = '1iyXfcpmvPjZq3JQtJKXeS-dWiWqJgDYFMquF7axS_gs';


// VALIDACIONES
function validarPuesto(numStr) {
  if (!numStr || numStr.trim() === '') {
    showPopup('⚠️ Ingresa un número de puesto', 'error');
    return false;
  }

  const numero = parseInt(numStr.trim());
  console.log('DEBUG: numStr.trim() =', numStr.trim());
  console.log('DEBUG: parseInt(numStr.trim()) =', numero);
  console.log('DEBUG: /^\d+$/.test(numStr.trim()) =', /^\d+$/.test(numStr.trim()));
  if (isNaN(numero) || !/^\d+$/.test(numStr.trim())) {
    showPopup('⚠️ Solo números permitidos', 'error');
    return false;
  }

  if (STATE.puestos.includes(numero.toString())) { // Compare as string since STATE.puestos stores strings
    showPopup('⚠️ Puesto ya existe', 'error');
    return false;
  }

  return true;
}

// RENDER


// HANDLERS
function addPuesto() {
  const input = document.getElementById('nuevo-puesto-input');
  if (!input) return;

  const num = input.value;
  if (!validarPuesto(num)) return;

  const nuevosPuestos = [...STATE.puestos, num.trim()];
  nuevosPuestos.sort((a, b) => parseInt(a) - parseInt(b));

  if (saveToStorage('puestos', nuevosPuestos)) {
    STATE.puestos = nuevosPuestos; // Actualizar solo si el guardado fue exitoso
    renderAll();
    showPopup('✓ Puesto añadido');
    input.value = '';
  }
}

function addTarea(puesto, tarea) {
  const now = new Date();
  const newLogEntry = {
    id: Date.now(),
    puesto,
    tarea,
    fecha: STATE.jornadaActual,
    hora: now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  };

  const nuevoLog = [newLogEntry, ...STATE.log];

  if (saveToStorage(`log-${STATE.jornadaActual}`, nuevoLog)) {
    STATE.log = nuevoLog; // Actualizar solo después de guardar
    renderDashboard();
    renderLog();
    showPopup('✓ Registro añadido');
  }
}

function quitarPuesto(puesto) {
  if (!confirm(`¿Seguro que quieres quitar el puesto ${puesto}?`)) return;

  const nuevosPuestos = STATE.puestos.filter(p => p !== puesto);

  if (saveToStorage('puestos', nuevosPuestos)) {
    STATE.puestos = nuevosPuestos; // Actualizar solo después de guardar
    renderAll();
    showPopup('✓ Puesto eliminado');
  }
}

function eliminarLog(id) {
  const logId = parseInt(id);

  // Intenta eliminar del log de la jornada actual
  const logHoyInicial = STATE.log.length;
  STATE.log = STATE.log.filter(l => l.id !== logId);

  if (logHoyInicial > STATE.log.length) {
    if (saveToStorage(`log-${STATE.jornadaActual}`, STATE.log)) {
      renderDashboard();
      renderLog();
      showPopup('✓ Registro eliminado');
    }
    return;
  }

  // --- NUEVO: Búsqueda optimizada en el historial ---
  const logIndexJSON = localStorage.getItem('log_index');
  if (!logIndexJSON) return; // No hay historial para buscar

  const logIndex = JSON.parse(logIndexJSON);

  for (const dateStr of logIndex) {
    // No volver a procesar el día actual
    if (dateStr === STATE.jornadaActual) continue;

    const key = `log-${dateStr}`;
    let logDia = loadFromStorage(key, []);
    const logDiaInicial = logDia.length;

    logDia = logDia.filter(l => l.id !== logId);

    if (logDiaInicial > logDia.length) {
      if (saveToStorage(key, logDia)) {
        if (logDia.length === 0) {
          // Opcional: Si el día queda vacío, eliminarlo del índice
          const updatedIndex = logIndex.filter(d => d !== dateStr);
          localStorage.setItem('log_index', JSON.stringify(updatedIndex));
        }
        if (STATE.vistaActual === 'historial') {
          renderHistorialCompleto();
        }
        showPopup('✓ Registro eliminado del historial');
      }
      return; // Termina en cuanto lo encuentra y elimina
    }
  }
}

function clearToday() {
  if (!confirm('¿Seguro que quieres borrar todos los registros de hoy?')) return;

  // Intentar guardar un log vacío.
  if (saveToStorage(`log-${STATE.jornadaActual}`, [])) {
    STATE.log = []; // Actualizar estado solo si el guardado fue exitoso
    renderAll();
    showPopup('✓ Registros de hoy eliminados');
  }
}

function resetColors() {
  if (!confirm('¿Resetear todos los colores?')) return;

  if (saveToStorage('colorPuestos', {})) {
    STATE.colorPuestos = {}; // Actualizar estado solo si el guardado fue exitoso
    renderAll();
    showPopup('✓ Colores reseteados');
  }
}



function finalizarJornada() {
  console.log('=== FINALIZANDO JORNADA ===');

  if (!confirm('¿Finalizar jornada y guardar en historial?')) return;

  const logHoy = STATE.log.filter(l => l.fecha === STATE.jornadaActual);

  if (logHoy.length === 0) {
    showPopup('⚠️ No hay registros para finalizar', 'error');
    return;
  }

  const logDelDia = {
    jornadaMinutos: STATE.jornadaMinutos,
    registros: logHoy
  };

  if (!saveToStorage(`log-${STATE.jornadaActual}`, logDelDia)) return;

  // --- NUEVO: Actualizar el índice de logs ---
  const logIndexJSON = localStorage.getItem('log_index');
  let logIndex = logIndexJSON ? JSON.parse(logIndexJSON) : [];
  if (!logIndex.includes(STATE.jornadaActual)) {
    logIndex.push(STATE.jornadaActual);
    logIndex.sort((a, b) => new Date(b) - new Date(a)); // Mantener ordenado
    localStorage.setItem('log_index', JSON.stringify(logIndex));
  }

  STATE.log = [];

  const today = new Date();
  today.setDate(today.getDate() + 1);
  STATE.jornadaActual = yyyyMmDd(today);
  localStorage.setItem('jornadaActual', STATE.jornadaActual);

  // Export to CSV
  const filename = `registros_jornada_${logHoy[0].fecha}.csv`; // Use the date of the finalized log
  exportToCsv(logHoy, filename);

  renderAll();
  showPopup('✓ Jornada finalizada correctamente');
}

function handleUpdateJornadaMinutos() {
  const input = document.getElementById('jornada-minutos-input');
  if (!input) return;

  const newMinutos = parseInt(input.value.trim());

  if (isNaN(newMinutos) || newMinutos <= 0) {
    showPopup('⚠️ Ingresa un número válido y positivo para los minutos de jornada.', 'error');
    return;
  }

  STATE.jornadaMinutos = newMinutos;
  localStorage.setItem('jornadaMinutos', newMinutos); // Save to localStorage

  // Update the display next to the input
  const display = document.getElementById('jornada-horas-display');
  if (display) {
    const h = Math.floor(newMinutos / 60);
    const m = newMinutos % 60;
    display.textContent = `(${h}h ${m}m)`;
  }

  // Re-render the 'Horas' view if it's active, or just update the calculations
  if (STATE.vistaActual === 'horas') {
    renderDistribucionHoras(document.querySelector('.horas-filtros button.active')?.dataset.rango || 'hoy');
  }

  showPopup('✓ Minutos de jornada actualizados.');
}

function togglePuestoStatus(puesto) {
  const currentStatus = STATE.puestoStatus[puesto] || { active: true };

  if (currentStatus.active) {
    // STOPPING
    // Calculate estimated time based on start of day? For now, we ask the user.
    // Default suggestion: The full jornada so far? Or simply blank?
    // Let's default to current Jornada Minutos to be safe, or 0.

    // Simple prompt for now as per plan
    const input = prompt(`Finalizar Puesto ${puesto}.\n¿Cuántos minutos ha estado disponible hoy?`, STATE.jornadaMinutos);
    if (input === null) return; // Cancelled

    const minutes = parseInt(input);
    if (isNaN(minutes) || minutes < 0) {
      alert("Por favor, introduce un número válido.");
      return;
    }

    const newStatus = { active: false, minutes: minutes };
    const newGlobalStatus = { ...STATE.puestoStatus, [puesto]: newStatus };

    if (saveToStorage(`puestoStatus-${STATE.jornadaActual}`, newGlobalStatus)) {
      STATE.puestoStatus = newGlobalStatus;
      renderAll();
      showPopup(`🏁 Puesto ${puesto} finalizado (${minutes} min)`);
    }

  } else {
    // RESUMING
    if (!confirm(`¿Reanudar Puesto ${puesto}? Se volverá a usar la jornada completa para los cálculos.`)) return;

    const newStatus = { active: true, minutes: null };
    const newGlobalStatus = { ...STATE.puestoStatus, [puesto]: newStatus };

    if (saveToStorage(`puestoStatus-${STATE.jornadaActual}`, newGlobalStatus)) {
      STATE.puestoStatus = newGlobalStatus;
      renderAll();
      showPopup(`▶️ Puesto ${puesto} reanudado`);
    }
  }
}


// CONFIGURATION LOGIC
function openSettings() {
  const modal = document.getElementById('settings-modal');
  const container = document.getElementById('tasks-config-container');
  const puestosContainer = document.getElementById('puestos-config-container');
  const jornadaInput = document.getElementById('config-jornada-minutos');

  if (!modal || !container) return;

  // Set Jornada
  if (jornadaInput) jornadaInput.value = STATE.config.JORNADA_MINUTOS;

  // Generate Task Rows
  container.innerHTML = STATE.config.ordenTareas.map(t => {
    const abrev = STATE.config.abrev[t];
    const tiempo = STATE.config.tiempos[t];
    const color = STATE.config.coloresTareas[t] || '#888888';

    return `
      <div class="task-config-row" data-task="${t}">
        <label>
          Tarea (${t}):
          <input type="text" class="config-abrev" value="${abrev}" placeholder="Nombre">
        </label>
        <label>
          Minutos:
          <input type="number" class="config-time" value="${tiempo}" style="width: 70px;">
        </label>
        <label>
          Color:
          <input type="color" class="config-color" value="${color}">
        </label>
      </div>
    `;
  }).join('');

  // Generate Puesto Rows
  if (puestosContainer) {
    puestosContainer.innerHTML = STATE.puestos.map(p => {
      const color = getColorPuesto(p);
      return `
        <div class="task-config-row puesto-config-row" data-puesto="${p}" style="margin-bottom:0;">
          <label style="width:auto; margin-right:5px;">P${p}:</label>
          <input type="color" class="config-puesto-color" value="${color}">
        </div>
      `;
    }).join('');
  }

  modal.classList.remove('hidden');
}

function saveSettings() {
  const taskRows = document.querySelectorAll('.task-config-row:not(.puesto-config-row)');
  const puestoRows = document.querySelectorAll('.puesto-config-row');
  const jornadaInput = document.getElementById('config-jornada-minutos');

  const newConfig = { ...STATE.config }; // Start with current config
  const newColorPuestos = { ...STATE.colorPuestos };

  // Update Jornada
  if (jornadaInput) {
    newConfig.JORNADA_MINUTOS = parseInt(jornadaInput.value) || 465;
  }

  // Update Tasks
  taskRows.forEach(row => {
    const taskKey = row.dataset.task;
    const abrevInput = row.querySelector('.config-abrev');
    const timeInput = row.querySelector('.config-time');
    const colorInput = row.querySelector('.config-color');

    if (abrevInput) newConfig.abrev[taskKey] = abrevInput.value.trim();
    if (timeInput) newConfig.tiempos[taskKey] = parseInt(timeInput.value) || 0;
    if (colorInput) newConfig.coloresTareas[taskKey] = colorInput.value;
  });

  // Update Puestos
  puestoRows.forEach(row => {
    const puesto = row.dataset.puesto;
    const colorInput = row.querySelector('.config-puesto-color');
    if (colorInput) {
      newColorPuestos[puesto] = colorInput.value;
    }
  });

  // Save Puestos Colors
  saveToStorage('colorPuestos', newColorPuestos);
  STATE.colorPuestos = newColorPuestos;

  // Save to Storage using helper logic (raw stringify here for simplicity as it's a specific object)
  localStorage.setItem('appConfig', JSON.stringify(newConfig));

  // Also update individual override if needed, but 'appConfig' is the master now.
  localStorage.setItem('jornadaMinutos', newConfig.JORNADA_MINUTOS);

  showPopup('💾 Configuración guardada. Recargando...');
  setTimeout(() => window.location.reload(), 1500);
}

function closeSettings() {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.add('hidden');
}

function exportToCsv(logToExport, filename = 'registros_jornada.csv') {
  if (!logToExport || logToExport.length === 0) {
    showPopup('⚠️ No hay datos para exportar.', 'error');
    return;
  }

  // === TABLA 1: DISTRIBUCIÓN DE TIEMPOS ===
  const esfuerzoPorPuesto = {};
  const esfuerzoDia = logToExport.reduce((acc, l) => {
    acc[l.puesto] = (acc[l.puesto] || 0) + (STATE.config.tiempos[l.tarea] || 0);
    return acc;
  }, {});

  const totalEsfuerzoDia = Object.values(esfuerzoDia).reduce((s, v) => s + v, 0);

  if (totalEsfuerzoDia > 0) {
    Object.keys(esfuerzoDia).forEach(puesto => {
      const minutosDiaPuesto = (esfuerzoDia[puesto] / totalEsfuerzoDia) * STATE.jornadaMinutos;
      esfuerzoPorPuesto[puesto] = minutosDiaPuesto;
    });
  }

  // === TABLA 2: RESUMEN DIARIO ===
  const contador = logToExport.reduce((acc, l) => {
    acc[l.puesto] = acc[l.puesto] || { total: 0, ...STATE.config.ordenTareas.reduce((a, t) => ({ ...a, [t]: 0 }), {}) };
    acc[l.puesto][l.tarea]++;
    acc[l.puesto].total++;
    return acc;
  }, {});

  // === GENERAR CSV ===
  let csvContent = `JORNADA: ${logToExport[0].fecha}\n\n`;

  // Tabla 1
  csvContent += 'DISTRIBUCIÓN DE TIEMPOS\n';
  csvContent += 'Puesto,Tiempo,Decimal\n';
  Object.keys(esfuerzoPorPuesto)
    .sort((a, b) => esfuerzoPorPuesto[b] - esfuerzoPorPuesto[a])
    .forEach(p => {
      const minutos = esfuerzoPorPuesto[p];
      const horas = minutos / 60;
      const h = Math.floor(horas);
      const m = Math.round(minutos % 60);
      csvContent += `P${p},${h}h ${m}min,${horas.toFixed(2)}\n`;
    });

  csvContent += '\n'; // Separador

  // Tabla 2
  csvContent += 'RESUMEN DIARIO\n';
  csvContent += 'Puesto,' + STATE.config.ordenTareas.map(t => STATE.config.abrev[t]).join(',') + ',Total\n';
  Object.keys(contador)
    .sort((a, b) => contador[b].total - contador[a].total)
    .forEach(p => {
      csvContent += `Puesto ${p},` +
        STATE.config.ordenTareas.map(t => contador[p][t] || 0).join(',') +
        `,${contador[p].total}\n`;
    });

  csvContent += '\n'; // Separador final

  console.log('=== PREPARANDO EXPORTACIÓN ===');
  console.log('Fecha:', logToExport[0].fecha);
  console.log('Esfuerzo por puesto:', esfuerzoPorPuesto);
  console.log('Contador:', contador);

  // Descargar CSV
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showPopup('✓ Datos exportados a CSV.');
  } else {
    showPopup('⚠️ Tu navegador no soporta la descarga automática de archivos.', 'error');
  }

  // Enviar a Google Sheets
  enviarAGoogleSheets(logToExport[0].fecha, esfuerzoPorPuesto, contador)
    .catch(err => console.error('Error en enviarAGoogleSheets:', err));
}

// === FUNCIÓN PARA ENVIAR A GOOGLE SHEETS ===
async function enviarAGoogleSheets(fecha, tiempos, resumen) {
  console.log('=== INICIANDO ENVÍO A GOOGLE SHEETS ===');
  console.log('Fecha:', fecha);
  console.log('Tiempos:', tiempos);
  console.log('Resumen:', resumen);

  try {
    // Preparar datos para Sheets
    const values = [];

    // Encabezado de jornada
    values.push([`JORNADA: ${fecha}`]);
    values.push([]);

    // Tabla 1: Tiempos
    values.push(['DISTRIBUCIÓN DE TIEMPOS']);
    values.push(['Puesto', 'Tiempo', 'Decimal']);
    Object.keys(tiempos)
      .sort((a, b) => tiempos[b] - tiempos[a])
      .forEach(p => {
        const minutos = tiempos[p];
        const horas = minutos / 60;
        const h = Math.floor(horas);
        const m = Math.round(minutos % 60);
        values.push([`P${p}`, `${h}h ${m}min`, parseFloat(horas.toFixed(2))]);
      });

    values.push([]);

    // Tabla 2: Resumen
    values.push(['RESUMEN DIARIO']);
    values.push(['Puesto', ...STATE.config.ordenTareas.map(t => STATE.config.abrev[t]), 'Total']);
    Object.keys(resumen)
      .sort((a, b) => resumen[b].total - resumen[a].total)
      .forEach(p => {
        values.push([
          `Puesto ${p}`,
          ...STATE.config.ordenTareas.map(t => resumen[p][t] || 0),
          resumen[p].total
        ]);
      });

    values.push([]);
    values.push([]);

    console.log('Enviando datos a Apps Script...');
    console.log('Número de filas:', values.length);
    console.log('Columnas por fila:', values.map(r => r.length));

    // Normalizar: todas las filas deben tener el mismo número de columnas
    const maxCols = Math.max(...values.map(r => r.length));
    const normalizedValues = values.map(row => {
      const newRow = [...row];
      while (newRow.length < maxCols) {
        newRow.push(''); // Rellenar con celdas vacías
      }
      return newRow;
    });

    console.log('Datos normalizados:', normalizedValues);

    // Enviar a Google Apps Script
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: normalizedValues })
    });

    // Con mode: 'no-cors' no podemos leer la respuesta, pero si no hay error, asumimos éxito
    console.log('Petición enviada a Apps Script');
    showPopup('✓ Datos enviados a Google Sheets');

  } catch (error) {
    console.error('Error enviando a Google Sheets:', error);
    showPopup('⚠️ Error al enviar a Sheets. CSV descargado.', 'error');
  }
}

// SETUP LISTENERS
function setupListeners() {
  const addBtn = document.getElementById('add-puesto-btn');
  if (addBtn) addBtn.onclick = addPuesto;

  const input = document.getElementById('nuevo-puesto-input');
  if (input) {
    input.onkeypress = (e) => {
      if (e.key === 'Enter') addPuesto();
    };
  }

  const clearBtn = document.getElementById('clear-today-btn');
  if (clearBtn) clearBtn.onclick = clearToday;

  const resetBtn = document.getElementById('reset-colors-btn');
  if (resetBtn) resetBtn.onclick = resetColors;

  const finalizarBtn = document.getElementById('finalizar-jornada-btn');
  if (finalizarBtn) finalizarBtn.onclick = finalizarJornada;

  const saveJornadaBtn = document.getElementById('save-jornada-btn');
  if (saveJornadaBtn) saveJornadaBtn.onclick = handleUpdateJornadaMinutos;

  // SETTINGS
  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) settingsBtn.onclick = openSettings;

  const closeSettingsBtn = document.getElementById('close-settings-btn');
  if (closeSettingsBtn) closeSettingsBtn.onclick = closeSettings;

  const saveSettingsBtn = document.getElementById('save-settings-btn');
  if (saveSettingsBtn) saveSettingsBtn.onclick = saveSettings;

  const modoToggle = document.querySelector('.modo-toggle');
  if (modoToggle) {
    modoToggle.onclick = (e) => {
      if (e.target.tagName === 'BUTTON' && e.target.dataset.vista) {
        cambiarVista(e.target.dataset.vista);
      }
    };
  }



  const horasFiltros = document.querySelector('.horas-filtros');
  if (horasFiltros) {
    horasFiltros.onclick = (e) => {
      if (e.target.tagName === 'BUTTON' && e.target.dataset.rango) {
        document.querySelectorAll('.horas-filtros button').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        renderDistribucionHoras(e.target.dataset.rango);
      }
    };
  }

  const graficasFiltros = document.querySelector('.filtros-graficas');
  if (graficasFiltros) {
    graficasFiltros.onclick = (e) => {
      if (e.target.tagName === 'BUTTON' && e.target.dataset.periodo) {
        document.querySelectorAll('.filtros-graficas button').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        renderGraficas(e.target.dataset.periodo);
      }
    };
  }

  document.body.onclick = (e) => {
    const target = e.target;

    if (target.classList.contains('add-tarea-btn')) {
      addTarea(target.dataset.puesto, target.dataset.tarea);
    }

    if (target.classList.contains('quitar-puesto-btn')) {
      quitarPuesto(target.dataset.puesto);
    }

    if (target.classList.contains('stop-puesto-btn') || target.classList.contains('resume-puesto-btn')) {
      togglePuestoStatus(target.dataset.puesto);
    }

    if (target.classList.contains('eliminar-log-btn')) {
      eliminarLog(target.dataset.id);
    }

    // BACKUP & RESTORE
    if (target.id === 'backup-btn') {
      const data = exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-thuprod-${yyyyMmDd(new Date())}.json`;
      a.click();
      showPopup('💾 Copia guardada correctamente');
    }

    if (target.id === 'restore-btn') {
      document.getElementById('restore-input').click();
    }
  };

  // RESTORE INPUT CHANGE
  const restoreInput = document.getElementById('restore-input');
  if (restoreInput) {
    restoreInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        if (confirm('⚠️ ¿Estás seguro? Esto sobrescribirá todos los datos actuales con los del archivo.')) {
          const success = importData(event.target.result);
          if (success) {
            showPopup('✅ Datos restaurados. Recargando...', 'success');
            setTimeout(() => window.location.reload(), 2000);
          } else {
            showPopup('❌ Error restaurando archivo', 'error');
          }
        }
      };
      reader.readAsText(file);
    };
  }
}

// INIT
function init() {
  try {
    console.log('Initializing app...');

    if (!localStorage.getItem('historialMigrado')) {
      migrateHistorial();
    }

    // --- NUEVO: Migración para crear el índice de logs ---
    if (!localStorage.getItem('log_index')) {
      console.log('Creando índice de logs por primera vez...');
      const logIndex = Object.keys(localStorage)
        .filter(key => key.startsWith('log-'))
        .map(key => key.replace('log-', ''))
        .sort((a, b) => new Date(b) - new Date(a)); // Ordenar más recientes primero

      localStorage.setItem('log_index', JSON.stringify(logIndex));
      console.log('Índice de logs creado.', logIndex);
    }

    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark-mode') {
      document.body.classList.add('dark-mode');
      const btn = document.getElementById('theme-toggle');
      if (btn) btn.textContent = '☀️';
    }

    const jornadaInput = document.getElementById('jornada-minutos-input');
    if (jornadaInput) {
      jornadaInput.value = STATE.jornadaMinutos;
      const display = document.getElementById('jornada-horas-display');
      if (display) {
        const h = Math.floor(STATE.jornadaMinutos / 60);
        const m = STATE.jornadaMinutos % 60;
        display.textContent = `(${h}h ${m}m)`;
      }
    }

    renderAll();
    setupListeners();



    console.log('=== APP INITIALIZED ===');
  } catch (e) {
    console.error('Error crítico inicializando:', e);
    alert('Error iniciando la aplicación. Recarga la página.');
  }
}

// EJECUTAR
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
