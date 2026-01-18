/* js/mobile/LedSelectionState.js */

export default class LedSelectionState {
  constructor() {
    this._selected = []; // numbers
    this._source = 0;    // number
  }

  _uniqSorted(nums) {
    const s = new Set();
    for (const v of nums || []) {
      const n = v | 0;
      if (Number.isFinite(n)) s.add(n);
    }
    return Array.from(s).sort((a, b) => a - b);
  }

  _clampSelection({ ledCount, selected, source }) {
    const n = Math.max(0, ledCount | 0);

    let sel = this._uniqSorted(selected);
    sel = sel.filter((x) => x >= 0 && x < n);

    let src = source | 0;
    if (!(src >= 0 && src < n)) src = 0;

    if (n > 0 && sel.length === 0) sel = [src];
    if (n > 0 && !sel.includes(src)) sel = this._uniqSorted([...sel, src]);

    return { selected: sel, source: src };
  }

  ensureDefaultsForSingleLed({ ledCount }) {
    const n = Math.max(0, ledCount | 0);
    if (n <= 0) {
      this._selected = [];
      this._source = 0;
      return;
    }

    if (!Array.isArray(this._selected) || this._selected.length === 0) {
      this._selected = Array.from({ length: n }, (_, i) => i);
      this._source = 0;
      return;
    }

    const cl = this._clampSelection({ ledCount: n, selected: this._selected, source: this._source });
    this._selected = cl.selected;
    this._source = cl.source;
  }

  setFromModal({ ledCount, selectedLeds, sourceLed }) {
    const n = Math.max(0, ledCount | 0);
    const cl = this._clampSelection({ ledCount: n, selected: selectedLeds, source: sourceLed });
    this._selected = cl.selected;
    this._source = cl.source;
  }

  getSingleSelected() {
    return this._selected.slice();
  }

  getSingleSource() {
    return this._source | 0;
  }

  /**
   * Desktop-equivalent effective selection:
   * - multi-led mode => target=[multiIndex], source=multiIndex
   * - single-led mode => target=selected[], source=source
   */
  getEffectiveSelection({ isMultiMode, multiIndex, ledCount }) {
    const mi = multiIndex | 0;
    const n = Math.max(0, ledCount | 0);

    if (isMultiMode) {
      return { targetLeds: [mi], sourceLed: mi, locked: true };
    }

    this.ensureDefaultsForSingleLed({ ledCount: n });
    return { targetLeds: this.getSingleSelected(), sourceLed: this.getSingleSource(), locked: false };
  }

  /**
   * For your ColorPicker LED button label
   */
  getSummary({ isMultiMode, ledCount }) {
    const n = Math.max(0, ledCount | 0);
    if (isMultiMode) return 'Multi';
    this.ensureDefaultsForSingleLed({ ledCount: n });
    const sel = this._selected.length;
    if (n <= 0) return 'LEDs';
    return `${sel}/${n}`;
  }
}

