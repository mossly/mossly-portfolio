function setAspectRatio(img) {
  const aspectRatio = img.naturalHeight / img.naturalWidth;
  const paddingBottom = aspectRatio * 100;

  img.parentElement.style.paddingBottom = `${paddingBottom}%`;
}
