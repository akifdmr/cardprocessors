function truncate(value, maxLength = 500) {
  if (value == null) {
    return value;
  }

  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function getProviderMessage(error) {
  const data = error?.response?.data;
  if (!data) {
    return error?.message || "Provider request failed";
  }

  if (typeof data === "string") {
    return truncate(data, 240);
  }

  if (data.message) {
    return truncate(data.message, 240);
  }

  if (Array.isArray(data.errors) && data.errors[0]) {
    return truncate(data.errors[0].detail || data.errors[0].title || data.errors[0], 240);
  }

  return truncate(data, 240);
}

function isAxiosError(error) {
  return Boolean(error?.isAxiosError);
}

function maskUrl(url) {
  if (!url || typeof url !== "string") {
    return url;
  }

  return url
    .replace(/\/Accounts\/[^/]+/g, "/Accounts/[redacted]")
    .replace(/\/merchants\/[^/?]+/g, "/merchants/[redacted]");
}

function toSafeErrorLog(error) {
  if (!isAxiosError(error)) {
    return {
      name: error?.name,
      message: error?.message,
      stack: error?.stack
    };
  }

  return {
    name: error.name,
    message: error.message,
    code: error.code,
    providerStatus: error.response?.status,
    method: error.config?.method,
    url: maskUrl(error.config?.url),
    providerMessage: getProviderMessage(error)
  };
}

module.exports = {
  getProviderMessage,
  isAxiosError,
  toSafeErrorLog
};
