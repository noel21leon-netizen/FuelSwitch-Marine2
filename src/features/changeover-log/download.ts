// Browser file download / clipboard helpers for the CSV export. Both report failure instead of pretending to succeed.
export function downloadTextFile(fileName: string, text: string, mime = 'text/csv;charset=utf-8'): { ok: boolean; detail: string } {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { ok: true, detail: 'Download requested. If nothing was saved, your browser may have blocked it — use Copy CSV instead.' };
  } catch (e) {
    return { ok: false, detail: `Download failed: ${String(e)}` };
  }
}

export async function copyText(text: string): Promise<{ ok: boolean; detail: string }> {
  try {
    if (!navigator.clipboard) return { ok: false, detail: 'Clipboard is not available in this browser or context.' };
    await navigator.clipboard.writeText(text);
    return { ok: true, detail: 'CSV copied to the clipboard.' };
  } catch (e) {
    return { ok: false, detail: `Could not copy: ${String(e)}` };
  }
}
