// Handle image upload and apply preview
document.getElementById('uploadImage').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (event) {
      const texture = document.getElementById('textureArea');
      texture.style.backgroundImage = `url(${event.target.result})`;
      texture.style.backgroundSize = 'cover';
      texture.style.backgroundPosition = 'center';
      texture.innerHTML = '';
    };
    reader.readAsDataURL(file);
  }
});

// Mug type selection
document.querySelectorAll('#mugType button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#mugType button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Mug color selection
document.querySelectorAll('#mugColor .color').forEach(color => {
  color.addEventListener('click', () => {
    const mugPreview = document.getElementById('mugPreview');
    mugPreview.style.borderColor = color.dataset.color;
    mugPreview.style.boxShadow = `0 0 10px ${color.dataset.color}`;
  });
});

// Quantity validation
document.getElementById('quantity').addEventListener('change', e => {
  if (e.target.value < 1) e.target.value = 1;
});
