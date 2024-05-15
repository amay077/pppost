export function loadImageAsDataURL(blob: Blob): Promise<string> {
  return new Promise<string>(resolve => {
    const reader = new FileReader();
    reader.onload = (e: any) => {
      resolve(e.target.result);
    };
    reader.readAsDataURL(blob);
  })
}