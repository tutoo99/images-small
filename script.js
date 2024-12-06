// 格式化文件大小函数（放在最前面，因为其他函数会用到它）
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// 全局变量
let compressionTimer = null;
let currentFile = null;
let lastCompressionResult = {
  quality: null,
  blobSize: null,
  blobUrl: null,
};

// URL 管理器
const urlStore = {
  urls: new Set(),
  add(url) {
    this.urls.add(url);
  },
  clear() {
    this.urls.forEach((url) => URL.revokeObjectURL(url));
    this.urls.clear();
  },
};

// DOM 元素
const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const previewContainer = document.getElementById("previewContainer");
const originalImage = document.getElementById("originalImage");
const compressedImage = document.getElementById("compressedImage");
const originalSize = document.getElementById("originalSize");
const compressedSize = document.getElementById("compressedSize");
const compressionRate = document.getElementById("compressionRate");
const compressionValue = document.getElementById("compressionValue");
const downloadBtn = document.getElementById("downloadBtn");

// 添加文件上传事件监听
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file && validateFile(file)) {
    handleImageUpload(file);
  }
});

// 添加拖放事件监听
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.style.borderColor = "var(--primary-color)";
});

dropZone.addEventListener("dragleave", (e) => {
  e.preventDefault();
  dropZone.style.borderColor = "#ccc";
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.style.borderColor = "#ccc";
  const file = e.dataTransfer.files[0];
  if (file && validateFile(file)) {
    handleImageUpload(file);
  }
});

// 添加压缩率滑块事件监听
compressionRate.addEventListener("input", (e) => {
  const value = e.target.value;
  compressionValue.textContent = `${value}%`;

  if (!currentFile) {
    updateCompressionStatus({ type: "no-file" });
    return;
  }

  // 使用防抖处理压缩
  clearTimeout(compressionTimer);
  compressionTimer = setTimeout(() => {
    compressImage(currentFile, value / 100);
  }, 300);
});

// 文件验证函数
function validateFile(file) {
  const validTypes = ["image/jpeg", "image/png"];
  if (!validTypes.includes(file.type)) {
    alert("只支持 PNG 和 JPG 格式的图片");
    return false;
  }
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    alert("图片大小不能超过 10MB");
    return false;
  }
  return true;
}

// 处理图片上传
function handleImageUpload(file) {
  // 清理之前的资源
  if (currentFile) {
    if (lastCompressionResult.blobUrl) {
      URL.revokeObjectURL(lastCompressionResult.blobUrl);
    }
    lastCompressionResult = {
      quality: null,
      blobSize: null,
      blobUrl: null,
    };
  }

  currentFile = file;
  previewContainer.style.display = "grid"; // 改为 grid 以匹配 CSS

  // 显示图大小
  originalSize.textContent = formatFileSize(file.size);

  // 预览原图
  const reader = new FileReader();
  reader.onload = (e) => {
    originalImage.src = e.target.result;
    // 开始压缩
    const initialQuality = Number(compressionRate.value) / 100;
    compressImage(file, initialQuality);
  };
  reader.readAsDataURL(file);
}

// 压缩图片函数
function compressImage(file, quality) {
  // 确保质量参数在有效范围内
  quality = Math.max(0.1, Math.min(1, quality)); // 限制在 0.1-1 之间

  console.log("开始压缩，质量设置为:", quality);
  updateCompressionStatus({ type: "processing" });

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      // 处理大图片的尺寸
      let width = img.width;
      let height = img.height;
      if (file.size > 1024 * 1024) {
        // 大于1MB的图片进行尺寸调整
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            updateCompressionStatus({ type: "error" });
            return;
          }

          // 添加调试信息
          console.log("压缩参数:", {
            quality,
            originalSize: formatFileSize(file.size),
            compressedSize: formatFileSize(blob.size),
            width: canvas.width,
            height: canvas.height,
          });

          // 如果压缩后大小没有明显变化，可能需要调整压缩策略
          if (Math.abs(blob.size - lastCompressionResult.blobSize) < 100) {
            console.log("压缩效果未发生明显变化，可能需要调整压缩策略");
          }

          // 清理之前的 URL
          if (lastCompressionResult.blobUrl) {
            URL.revokeObjectURL(lastCompressionResult.blobUrl);
            urlStore.urls.delete(lastCompressionResult.blobUrl);
          }

          const blobUrl = URL.createObjectURL(blob);
          urlStore.add(blobUrl);

          lastCompressionResult = {
            quality,
            blobSize: blob.size,
            blobUrl,
          };

          // 先设置图片源，确保图片会显示
          compressedImage.src = blobUrl;
          compressedImage.onload = () => {
            // 图片加载完成后更新状态
            updateCompressionStatus({
              type: "compressed",
              originalSize: file.size,
              compressedSize: blob.size,
              quality,
            });
          };

          downloadBtn.onclick = () => {
            const link = document.createElement("a");
            link.download = `compressed_${file.name}`;
            link.href = blobUrl;
            link.click();
          };

          // 在 compressImage 函数中添加文件大小检查
          if (blob.size > file.size) {
            console.log(
              "警告：压缩后文件变大，建议降低质量设置或使用其他压缩方式"
            );
            // 可以考虑自动调整到较低的质量重试压缩
            if (quality > 0.5) {
              console.log("尝试使用较低的质量重新压缩");
              compressImage(file, quality * 0.8);
              return;
            }
          }
        },
        file.type,
        quality
      );
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// 添加页面卸载时的清理
window.addEventListener("beforeunload", () => {
  urlStore.clear();
  currentFile = null;
});

// 在 formatFileSize 函数后添加 updateCompressionStatus 函数
function updateCompressionStatus(status) {
  const compressionInfo = document.getElementById("compressionInfo");
  switch (status.type) {
    case "waiting":
      compressionInfo.textContent = "等待压缩...";
      break;
    case "processing":
      compressionInfo.textContent = "正在压缩...";
      break;
    case "unchanged":
      compressionInfo.textContent = "压缩质量未变化，保持当前结果";
      break;
    case "no-file":
      compressionInfo.textContent = "请先上传图片";
      break;
    case "best-quality":
      compressionInfo.textContent = "当前图片已是最佳质量，无需进一步处理";
      compressedSize.textContent = `${formatFileSize(
        status.size
      )} (已是最佳质量)`;
      break;
    case "compressed":
      const difference = status.originalSize - status.compressedSize;
      const savedPercent = Math.round((difference / status.originalSize) * 100);
      const quality = Math.round(status.quality * 100);

      // 根据压缩质量显示对应的描述
      let qualityDesc;
      if (quality >= 90) {
        qualityDesc = "最佳质量，文件较大";
      } else if (quality >= 70) {
        qualityDesc = "高质量，适中大小";
      } else if (quality >= 40) {
        qualityDesc = "平衡质量与大小";
      } else {
        qualityDesc = "高压缩，质量较低";
      }

      // 处理压缩后文件更大的情况
      if (savedPercent < 0) {
        compressionInfo.textContent = `当前设置: ${qualityDesc} (质量: ${quality}%, 原始: ${formatFileSize(
          status.originalSize
        )}, 压缩后: ${formatFileSize(
          status.compressedSize
        )}, 文件增大: ${Math.abs(savedPercent)}%)`;
        compressedSize.textContent = `${formatFileSize(
          status.compressedSize
        )} (文件增大 ${formatFileSize(Math.abs(difference))}, ${Math.abs(
          savedPercent
        )}%)`;
      } else {
        compressionInfo.textContent = `当前设置: ${qualityDesc} (质量: ${quality}%, 原始: ${formatFileSize(
          status.originalSize
        )}, 压缩后: ${formatFileSize(
          status.compressedSize
        )}, 节省: ${savedPercent}%)`;
        compressedSize.textContent = `${formatFileSize(
          status.compressedSize
        )} (节省 ${formatFileSize(difference)}, ${savedPercent}%)`;
      }
      break;
    case "error":
      compressionInfo.textContent = status.message || "压缩失败，请重试";
      break;
  }
}
