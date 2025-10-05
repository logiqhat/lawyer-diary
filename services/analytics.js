import analytics from '@react-native-firebase/analytics';

async function safeLogEvent(name, params) {
  try {
    await analytics().logEvent(name, params);
  } catch (error) {
    console.warn(`Analytics logEvent failed for ${name}`, error);
  }
}

export function logAuthEvent(type, status, props = {}) {
  return safeLogEvent('auth_event', {
    type,
    status,
    ...sanitizeParams(props),
  });
}

function sanitizeParams(params = {}) {
  const safe = {};
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
    } else {
      safe[key] = String(value);
    }
  });
  return safe;
}

export function logGenericEvent(name, params) {
  return safeLogEvent(name, sanitizeParams(params));
}

export function logUiEvent(action, element, props = {}) {
  return safeLogEvent('ui_event', sanitizeParams({ action, element, ...props }));
}

export function logTap(element, props = {}) {
  return logUiEvent('tap', element, props);
}
