// Triggers a browser download of a Blob via a temporary hidden <a download> link.
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob),
    link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  // Keep the object URL alive for a minute so slow downloads can still read it.
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 60000);
}
