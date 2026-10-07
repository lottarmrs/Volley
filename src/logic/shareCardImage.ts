import { toPng } from 'html-to-image';

export async function shareCardImage(node: HTMLElement, playerName: string): Promise<void> {
  await document.fonts.ready;

  const dataUrl = await toPng(node, {
    pixelRatio: 2.5,
    cacheBust: true,
    style: {
      transform: 'scale(1)',
      transformOrigin: 'top left',
    },
  });

  const filename = `vut-${playerName.toLowerCase().replace(/\s+/g, '-')}.png`;

  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], filename, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: `Carta VUT — ${playerName}`,
      text: `Confira minha carta no Volley Ultimate Team!`,
    });
  } else {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }
}
