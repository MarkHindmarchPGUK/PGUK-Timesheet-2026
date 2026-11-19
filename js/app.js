(() => {
  'use strict';

  const STORAGE_ENTRIES = 'pguk_timesheet_entries_v1';
  const STORAGE_NAME = 'pguk_timesheet_name_v1';
  const PERIOD_START_DAY = 19;        // payroll periods run 19th to 18th
  const STANDARD_MINUTES = 12 * 60;   // a standard day is 12 hours

  // Types of day. 'day' = standard day shift (nothing ticked).
  const SHIFT_TYPES = {
    day:       { label: 'Standard day' },
    premium:   { label: 'Night shift premium' },
    leave:     { label: 'Annual leave', fixed: true },
    stooddown: { label: 'Stood down',   fixed: true },
  };
  const isFixed = (t) => !!SHIFT_TYPES[t].fixed;

  const el = (id) => document.getElementById(id);

  // ---------- Date helpers (all local, string-based to dodge timezone bugs) ----------

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function parseDateStr(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function toDateStr(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function formatDisplay(dateStr) {
    const d = parseDateStr(dateStr);
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  // ---------- Payroll period helpers (19th of one month -> 18th of the next) ----------

  function periodStartOf(dateStr) {
    const d = parseDateStr(dateStr);
    const y = d.getFullYear();
    const m = d.getMonth(); // 0-indexed
    if (d.getDate() >= PERIOD_START_DAY) {
      return toDateStr(new Date(y, m, PERIOD_START_DAY));
    }
    return toDateStr(new Date(y, m - 1, PERIOD_START_DAY));
  }

  function periodEndFor(periodStartStr) {
    const d = parseDateStr(periodStartStr);
    return toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, PERIOD_START_DAY - 1));
  }

  function addPeriods(periodStartStr, n) {
    const d = parseDateStr(periodStartStr);
    return toDateStr(new Date(d.getFullYear(), d.getMonth() + n, PERIOD_START_DAY));
  }

  function formatPeriodRange(startStr) {
    const start = parseDateStr(startStr);
    const end = parseDateStr(periodEndFor(startStr));
    const sameYear = start.getFullYear() === end.getFullYear();
    const startFmt = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
    const endFmt = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${startFmt} – ${endFmt}`;
  }

  // ---------- Duration helpers (everything is stored in whole minutes) ----------

  function fmtDur(min) {
    const h = Math.floor(min / 60), m = min % 60;
    if (h && m) return `${h}h ${pad(m)}m`;
    if (h) return `${h}h`;
    return `${m}m`;
  }

  // Overtime total: "0h" when none, otherwise e.g. "5h 40m".
  function fmtOvertime(min) {
    return min === 0 ? '0h' : fmtDur(min);
  }

  // Minutes between two "HH:MM" times. Finishing earlier than the start means
  // the shift ran past midnight. Identical times return 0 (treated as invalid).
  function calcMinutes(start, end) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let d = (eh * 60 + em) - (sh * 60 + sm);
    if (d < 0) d += 24 * 60;
    return d;
  }

  // Annual leave / stood down never earn overtime. Days under 12h earn none either
  // (they are still paid as a full day).
  function otMinutes(e) {
    return isFixed(e.shift) ? 0 : Math.max(0, e.minutes - STANDARD_MINUTES);
  }

  // ---------- State ----------

  // Brings older entries (plain hours, 'day'/'night') up to the current shape.
  function normalise(e) {
    let shift = e.shift === 'night' ? 'premium' : e.shift;
    if (!SHIFT_TYPES[shift]) shift = 'day';
    const minutes = typeof e.minutes === 'number' ? e.minutes : Math.round((e.hours || 0) * 60);
    return { id: e.id, createdAt: e.createdAt, date: e.date, shift, minutes,
             start: e.start || null, end: e.end || null, note: e.note || '' };
  }

  let entries = loadEntries();
  let currentPeriodStart = periodStartOf(todayStr());
  let editingId = null;
  let currentNote = ''; // delivery note for the night shift premium being entered

  function loadEntries() {
    try {
      return (JSON.parse(localStorage.getItem(STORAGE_ENTRIES)) || []).map(normalise);
    } catch {
      return [];
    }
  }

  function saveEntries() {
    localStorage.setItem(STORAGE_ENTRIES, JSON.stringify(entries));
  }

  function loadName() {
    return localStorage.getItem(STORAGE_NAME) || '';
  }

  function saveName(name) {
    localStorage.setItem(STORAGE_NAME, name);
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ---------- Rendering ----------

  function periodEntries() {
    const periodEnd = periodEndFor(currentPeriodStart);
    return entries
      .filter(e => e.date >= currentPeriodStart && e.date <= periodEnd)
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  }

  function renderPeriodLabel() {
    const isCurrent = currentPeriodStart === periodStartOf(todayStr());
    el('periodLabel').textContent = formatPeriodRange(currentPeriodStart);
    el('periodSublabel').textContent = isCurrent ? 'Current payroll period' : '';
  }

  // "Days worked" = standard days + night shift premium days. Annual leave and
  // stood down days are counted separately.
  function summarise(list) {
    const s = { days: 0, premiums: 0, leave: 0, stood: 0, overtime: 0 };
    list.forEach(e => {
      if (e.shift === 'leave') s.leave++;
      else if (e.shift === 'stooddown') s.stood++;
      else {
        s.days++;
        if (e.shift === 'premium') s.premiums++;
      }
      s.overtime += otMinutes(e);
    });
    return s;
  }

  function renderSummary(list) {
    const s = summarise(list);
    el('totalDays').textContent = s.days;
    el('statPremium').textContent = s.premiums;
    el('statOvertime').textContent = fmtOvertime(s.overtime);
    el('statLeave').textContent = s.leave;
    el('statStood').textContent = s.stood;
    el('emptyNote').style.display = list.length > 0 ? 'none' : 'block';
  }

  function renderList(list) {
    const ul = el('entryList');
    ul.innerHTML = '';
    if (list.length === 0) {
      ul.innerHTML = '<li class="no-entries">No days logged for this payroll period yet.</li>';
      return;
    }
    list.forEach(e => {
      const ot = otMinutes(e);
      const times = e.start && e.end ? `${e.start} – ${e.end}` : '';
      const li = document.createElement('li');
      li.className = 'entry-item';
      li.innerHTML = `
        <div class="entry-main">
          <div class="entry-date">${formatDisplay(e.date)}<span class="badge ${e.shift}">${SHIFT_TYPES[e.shift].label}</span></div>
          ${times ? `<div class="entry-sub">${times}</div>` : ''}
          ${e.shift === 'premium' && e.note ? `<div class="entry-sub">Delivered to: ${escapeHtml(e.note)}</div>` : ''}
        </div>
        <div class="entry-side">
          <div class="entry-hours">${fmtDur(e.minutes)}</div>
          ${ot ? `<div class="entry-ot">+${fmtDur(ot)} overtime</div>` : ''}
          <div class="entry-actions">
            <button data-action="edit" data-id="${e.id}">Edit</button>
            <button data-action="delete" data-id="${e.id}" class="delete">Delete</button>
          </div>
        </div>
      `;
      ul.appendChild(li);
    });
  }

  function renderEmployee() {
    const name = loadName();
    el('employeeDisplay').textContent = name ? name : 'Tap to set your name';
  }

  function renderAll() {
    const list = periodEntries();
    renderPeriodLabel();
    renderSummary(list);
    renderList(list);
  }

  // ---------- Form ----------

  const form = el('entryForm');
  const formError = el('formError');
  const flagBoxes = Array.from(form.querySelectorAll('input[name="dayFlag"]'));

  // 24-hour time pickers (dropdowns, so they always show 24h regardless of phone settings).
  function fillSelect(sel, count, placeholder) {
    let html = `<option value="">${placeholder}</option>`;
    for (let i = 0; i < count; i++) html += `<option value="${pad(i)}">${pad(i)}</option>`;
    sel.innerHTML = html;
  }
  ['start', 'end'].forEach(p => {
    fillSelect(el(p + 'HH'), 24, 'HH');
    fillSelect(el(p + 'MM'), 60, 'MM');
    el(p + 'HH').addEventListener('change', () => {
      if (el(p + 'HH').value && !el(p + 'MM').value) el(p + 'MM').value = '00';
      updatePreview();
    });
    el(p + 'MM').addEventListener('change', updatePreview);
  });

  function readTime(p) {
    const hh = el(p + 'HH').value, mm = el(p + 'MM').value;
    return hh && mm ? `${hh}:${mm}` : null;
  }

  function setTime(p, value) {
    el(p + 'HH').value = value ? value.slice(0, 2) : '';
    el(p + 'MM').value = value ? value.slice(3, 5) : '';
  }

  function updatePreview() {
    const s = readTime('start'), e = readTime('end');
    const m = s && e ? calcMinutes(s, e) : 0;
    if (!m) { el('hoursPreview').textContent = ''; return; }
    const ot = Math.max(0, m - STANDARD_MINUTES);
    el('hoursPreview').textContent = `= ${fmtDur(m)} worked` + (ot ? ` · ${fmtDur(ot)} overtime` : '');
  }

  // Nothing ticked = standard day shift.
  function selectedType() {
    const ticked = flagBoxes.find(b => b.checked);
    return ticked ? ticked.value : 'day';
  }

  function applyTypeUI() {
    const t = selectedType();
    el('timesWrap').hidden = isFixed(t);
    el('autoNote').hidden = !isFixed(t);
    el('noteLine').hidden = t !== 'premium';
    el('noteText').textContent = currentNote;
  }

  // Only one of the three can be ticked at a time.
  flagBoxes.forEach(b => b.addEventListener('change', () => {
    if (b.checked) flagBoxes.forEach(o => { if (o !== b) o.checked = false; });
    applyTypeUI();
    if (b.checked && b.value === 'premium') openNoteModal();
  }));

  // ----- Night shift premium: "who did you deliver to?" pop-up -----

  function openNoteModal() {
    el('noteInput').value = currentNote;
    el('noteError').textContent = '';
    el('noteModal').hidden = false;
    setTimeout(() => el('noteInput').focus(), 50);
  }

  el('saveNoteBtn').addEventListener('click', () => {
    const v = el('noteInput').value.trim();
    if (!v) { el('noteError').textContent = 'Please enter who you delivered to.'; return; }
    currentNote = v;
    el('noteModal').hidden = true;
    applyTypeUI();
  });

  el('cancelNoteBtn').addEventListener('click', () => {
    el('noteModal').hidden = true;
    if (!currentNote) {
      // No note given, so the premium can't be claimed: untick it.
      flagBoxes.forEach(b => { if (b.value === 'premium') b.checked = false; });
      applyTypeUI();
    }
  });

  el('noteInput').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); el('saveNoteBtn').click(); }
  });

  el('editNoteBtn').addEventListener('click', openNoteModal);

  function resetForm() {
    form.reset();
    el('entryDate').value = todayStr();
    editingId = null;
    currentNote = '';
    el('entryId').value = '';
    applyTypeUI();
    updatePreview();
    el('formTitle').textContent = 'Add a day worked';
    el('saveEntryBtn').textContent = 'Save entry';
    el('cancelEditBtn').hidden = true;
    formError.textContent = '';
  }

  function startEdit(id) {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    editingId = id;
    el('entryId').value = id;
    el('entryDate').value = entry.date;
    flagBoxes.forEach(b => { b.checked = b.value === entry.shift; });
    setTime('start', entry.start);
    setTime('end', entry.end);
    currentNote = entry.note || '';
    applyTypeUI();
    updatePreview();
    el('formTitle').textContent = 'Edit entry';
    el('saveEntryBtn').textContent = 'Update entry';
    el('cancelEditBtn').hidden = false;
    formError.textContent = '';
    window.scrollTo({ top: form.offsetTop - 60, behavior: 'smooth' });
  }

  el('cancelEditBtn').addEventListener('click', resetForm);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    formError.textContent = '';

    const date = el('entryDate').value;
    const shift = selectedType();
    let minutes = STANDARD_MINUTES, start = null, end = null, note = '';

    if (!date) { formError.textContent = 'Please choose a date.'; return; }

    if (!isFixed(shift)) {
      start = readTime('start');
      end = readTime('end');
      if (!start || !end) { formError.textContent = 'Select both your start and finish times.'; return; }
      minutes = calcMinutes(start, end);
      if (minutes === 0) { formError.textContent = 'Start and finish times cannot be the same.'; return; }
    }

    if (shift === 'premium') {
      if (!currentNote) {
        formError.textContent = 'Add who you delivered to for the night shift premium.';
        openNoteModal();
        return;
      }
      note = currentNote;
    }

    if (editingId) {
      const entry = entries.find(e => e.id === editingId);
      Object.assign(entry, { date, shift, minutes, start, end, note });
    } else {
      entries.push({
        id: 'e_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        createdAt: Date.now(),
        date, shift, minutes, start, end, note
      });
    }

    saveEntries();
    resetForm();
    // Jump to the payroll period the saved entry belongs to, so it's visible.
    currentPeriodStart = periodStartOf(date);
    renderAll();
    showToast('Entry saved');
  });

  el('entryList').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit') {
      startEdit(id);
    } else if (btn.dataset.action === 'delete') {
      if (confirm('Delete this entry?')) {
        entries = entries.filter(e => e.id !== id);
        saveEntries();
        renderAll();
        showToast('Entry deleted');
      }
    }
  });

  // ---------- Period navigation ----------

  el('prevPeriodBtn').addEventListener('click', () => {
    currentPeriodStart = addPeriods(currentPeriodStart, -1);
    renderAll();
  });

  el('nextPeriodBtn').addEventListener('click', () => {
    currentPeriodStart = addPeriods(currentPeriodStart, 1);
    renderAll();
  });

  // ---------- Settings modal ----------

  const settingsModal = el('settingsModal');

  function openSettings() {
    el('employeeNameInput').value = loadName();
    settingsModal.hidden = false;
  }

  function closeSettings() {
    settingsModal.hidden = true;
  }

  el('settingsBtn').addEventListener('click', openSettings);
  el('employeeDisplay').addEventListener('click', openSettings);
  el('closeSettingsBtn').addEventListener('click', closeSettings);

  el('saveNameBtn').addEventListener('click', () => {
    const name = el('employeeNameInput').value.trim();
    saveName(name);
    renderEmployee();
    closeSettings();
    showToast('Name saved');
  });

  el('clearDataBtn').addEventListener('click', () => {
    if (confirm('This will permanently delete all logged timesheet entries on this device. Continue?')) {
      entries = [];
      saveEntries();
      renderAll();
      closeSettings();
      showToast('All timesheet data cleared');
    }
  });

  // ---------- Toast ----------

  let toastTimer = null;
  function showToast(msg) {
    const t = el('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // ---------- PDF export ----------

  el('exportPdfBtn').addEventListener('click', () => {
    const list = periodEntries();
    if (list.length === 0) {
      showToast('No entries to export for this payroll period');
      return;
    }
    exportPdf(list);
  });

  function exportPdf(list) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const name = loadName() || 'Unnamed driver';
    const periodRange = formatPeriodRange(currentPeriodStart);
    const s = summarise(list);

    const PAGE_HEIGHT = 841.89; // A4 in pt
    const FOOTER_RESERVE = 40;
    let y = 0;

    function ensureSpace(needed) {
      if (y + needed > PAGE_HEIGHT - FOOTER_RESERVE) {
        doc.addPage();
        y = 60;
      }
    }

    doc.setFontSize(16);
    doc.setTextColor(17, 58, 92);
    doc.text('PGUK Timesheet', 40, 46);

    doc.setFontSize(11);
    doc.setTextColor(40, 40, 40);
    doc.text(`Driver: ${name}`, 40, 66);
    doc.text(`Payroll period: ${periodRange}`, 40, 82);

    // ---------- Days table ----------
    const rows = list.map(e => {
      let dayType = SHIFT_TYPES[e.shift].label;
      if (e.shift === 'premium' && e.note) dayType += `\nDelivered to: ${e.note}`;
      const ot = otMinutes(e);
      return [
        formatDisplay(e.date),
        e.start || '–',
        e.end || '–',
        fmtDur(e.minutes),
        dayType,
        ot ? fmtDur(ot) : '–'
      ];
    });

    const rowFills = {
      premium:   [239, 234, 251],
      leave:     [228, 244, 234],
      stooddown: [253, 235, 226],
    };

    doc.autoTable({
      startY: 98,
      head: [['Date', 'Start', 'Finish', 'Hours', 'Day type', 'Overtime']],
      body: rows,
      styles: { fontSize: 9, cellPadding: 5, valign: 'middle' },
      headStyles: { fillColor: [17, 58, 92], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 72 },
        1: { cellWidth: 44, halign: 'center' },
        2: { cellWidth: 44, halign: 'center' },
        3: { cellWidth: 56, halign: 'center' },
        5: { cellWidth: 64, halign: 'center' },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const fill = rowFills[list[data.row.index].shift];
        if (fill) data.cell.styles.fillColor = fill;
      },
      margin: { left: 40, right: 40 },
    });

    y = doc.lastAutoTable.finalY + 14;
    ensureSpace(14);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110, 118, 128);
    doc.text('A standard day is 12 hours. Days under 12 hours are paid as a full day; overtime is any time worked over 12 hours.', 40, y);
    y += 26;

    // ---------- Totals table ----------
    ensureSpace(90);
    doc.setFontSize(11);
    doc.setTextColor(17, 58, 92);
    doc.setFont(undefined, 'bold');
    doc.text('Totals', 40, y);
    doc.setFont(undefined, 'normal');

    const overtimeText = s.overtime === 0
      ? '0h'
      : `${fmtDur(s.overtime)}\n(${(s.overtime / 60).toFixed(2)} hrs)`;

    doc.autoTable({
      startY: y + 8,
      head: [['Days worked', 'Night shift premiums', 'Annual leave days', 'Stood down days', 'Overtime hours']],
      body: [[String(s.days), String(s.premiums), String(s.leave), String(s.stood), overtimeText]],
      theme: 'grid',
      styles: { halign: 'center', valign: 'middle', cellPadding: 6, lineColor: [200, 207, 216] },
      headStyles: { fillColor: [17, 58, 92], textColor: 255, fontSize: 9 },
      bodyStyles: { fontSize: 12, fontStyle: 'bold', textColor: [28, 37, 48] },
      margin: { left: 40, right: 40 },
    });

    y = doc.lastAutoTable.finalY + 30;

    // ---------- Driver declaration ----------
    const declarationText = 'Driver declaration: I confirm that the dates, hours and shift details recorded in ' +
      'this timesheet are true and correct to the best of my knowledge. I accept that responsibility for any ' +
      'error in the information I have entered, and for any consequent effect on my pay, rests solely with me ' +
      'and not with Pro Gases UK.';
    const wrapped = doc.splitTextToSize(declarationText, 515);

    ensureSpace(14 + wrapped.length * 12 + 46);

    doc.setFontSize(10);
    doc.setTextColor(17, 58, 92);
    doc.setFont(undefined, 'bold');
    doc.text('Declaration', 40, y);
    y += 16;

    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    doc.setFont(undefined, 'normal');
    doc.text(wrapped, 40, y);
    y += wrapped.length * 12 + 26;

    doc.setDrawColor(180, 187, 196);
    doc.line(40, y, 260, y);
    doc.line(340, y, 480, y);
    y += 12;
    doc.setFontSize(8);
    doc.setTextColor(100, 108, 118);
    doc.text('Driver signature', 40, y);
    doc.text('Date', 340, y);

    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Generated ${new Date().toLocaleString('en-GB')}`, 40, PAGE_HEIGHT - 30);

    const fileSafeName = name.replace(/[^a-z0-9]+/gi, '_');
    const fileName = `PGUK_Timesheet_${fileSafeName}_${currentPeriodStart}.pdf`;

    // Prefer the native share sheet on mobile so it can go straight to email/WhatsApp etc.
    const blob = doc.output('blob');
    const file = new File([blob], fileName, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({
        files: [file],
        title: 'PGUK Timesheet',
        text: `Timesheet for ${name}, period ${periodRange}`
      }).catch(() => {
        doc.save(fileName);
      });
    } else {
      doc.save(fileName);
    }
  }

  // ---------- Init ----------

  el('entryDate').value = todayStr();
  applyTypeUI();
  renderEmployee();
  renderAll();

  if (!loadName()) {
    setTimeout(openSettings, 400);
  }

  // ---------- PWA service worker ----------

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
