// 1. Image Compressor: Fixes "Payload too large" error for Firestore
export const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; // Resize to 800px width
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Return compressed Base64
        resolve(canvas.toDataURL('image/jpeg', 0.7)); 
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

// 2. WhatsApp Link Generator
export const getWhatsAppLink = (phone, text) => {
  if (!phone) return "#";
  const cleanPhone = phone.replace(/\D/g, '');
  // Default to India (91) if no code provided
  const number = cleanPhone.length > 10 ? cleanPhone : `91${cleanPhone}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
};
