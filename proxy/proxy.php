<?php
// =======================================
// Simple HTTP Proxy with Basic Auth
// =======================================

// CONFIGURATION
$TARGET_BASE = 'http://91.123.179.17:6767';

// Basic Auth credentials
$AUTH_USER = 'extension';
$AUTH_PASS = '?w_@l(J>H6Q5/u`%fc"2_cD5N78Z4c>';

// -------------------------------
// CORS HELPERS & PRE-FLIGHT
// -------------------------------
/**
 * Set CORS headers on the response. If an Origin header is present it is echoed back
 * (required when Access-Control-Allow-Credentials is true). Otherwise Access-Control-Allow-Origin: *
 */
function set_cors_headers() {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? null;
    if ($origin) {
        header("Access-Control-Allow-Origin: $origin");
        header('Vary: Origin');
        // Allow sending credentials to the proxy (cookies/HTTP auth). Keep this only if needed.
        header('Access-Control-Allow-Credentials: true');
    } else {
        header('Access-Control-Allow-Origin: *');
    }
    // Expose common response headers to the browser
    header('Access-Control-Expose-Headers: Content-Length, Content-Type, Date, Server, ETag');
}

/**
 * Handle OPTIONS preflight and exit with appropriate headers.
 */
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    // Reflect allowed methods; you can adjust this list as needed
    $allowMethods = 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD';
    header("Access-Control-Allow-Methods: $allowMethods");

    // If the browser requested specific request headers, echo them back
    if (!empty($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'])) {
        header('Access-Control-Allow-Headers: ' . $_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']);
    } else {
        // Provide a sensible default set
        header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept, X-Requested-With');
    }

    // Cache preflight for 1 day
    header('Access-Control-Max-Age: 86400');

    set_cors_headers();

    // No body for preflight
    http_response_code(204);
    exit;
}

// -------------------------------
// AUTHENTICATION CHECK
// -------------------------------
if (
    !isset($_SERVER['PHP_AUTH_USER']) ||
    $_SERVER['PHP_AUTH_USER'] !== $AUTH_USER ||
    $_SERVER['PHP_AUTH_PW'] !== $AUTH_PASS
) {
    set_cors_headers();
    header('WWW-Authenticate: Basic realm="Restricted Proxy"');
    header('HTTP/1.0 401 Unauthorized');
    echo 'Unauthorized';
    exit;
}

// -------------------------------
// HELPER: get request headers
// -------------------------------
function get_request_headers_array(): array
{
    if (function_exists('getallheaders')) {
        return getallheaders();
    }
    $headers = [];
    foreach ($_SERVER as $name => $value) {
        if (str_starts_with($name, 'HTTP_')) {
            $headerName = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))));
            $headers[$headerName] = $value;
        }
    }
    return $headers;
}

// -------------------------------
// BUILD AND SEND TARGET REQUEST
// -------------------------------
// Replace how target URL/path is computed so requests to /proxy.php/start map -> /start
$requestUri = $_SERVER['REQUEST_URI'];           // e.g. "/proxy.php/start?x=1"
$scriptName = $_SERVER['SCRIPT_NAME'] ?? '';    // e.g. "/proxy.php"
$forwardPath = $requestUri;

// If the request URI starts with the script name, remove it
if ($scriptName !== '' && strpos($requestUri, $scriptName) === 0) {
    $forwardPath = substr($requestUri, strlen($scriptName)); // "/start?x=1"
} else {
    // Fallback: remove script dir prefix if present (covers /dir/proxy.php requests)
    $scriptDir = rtrim(dirname($scriptName), '/');
    if ($scriptDir !== '' && strpos($requestUri, $scriptDir) === 0) {
        $forwardPath = substr($requestUri, strlen($scriptDir));
    }
}

// Ensure we have a leading slash
if ($forwardPath === '' || $forwardPath[0] !== '/') {
    $forwardPath = '/' . ltrim($forwardPath, '/');
}

$targetUrl = rtrim($TARGET_BASE, '/') . $forwardPath;

$ch = curl_init($targetUrl);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);

if (
    $_SERVER['REQUEST_METHOD'] !== 'GET' &&
    $_SERVER['REQUEST_METHOD'] !== 'HEAD'
) {
    // Always set a body for non-GET/HEAD (empty string if none) so backend receives the request correctly
    $body = file_get_contents('php://input');
    if ($body === false) {
        $body = '';
    }
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

// Forward client headers (except Host / Content-Length)
$headers = [];
foreach (get_request_headers_array() as $name => $value) {
    $lname = strtolower($name);
    if ($lname === 'host' || $lname === 'content-length') {
        continue;
    }
    $headers[] = "$name: $value";
}
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

// Optional: disable SSL verification only if you trust the target (dev only!)
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);

$response = curl_exec($ch);

if ($response === false) {
    http_response_code(502);
    set_cors_headers();
    echo 'Bad Gateway: ' . curl_error($ch);
    curl_close($ch);
    exit;
}

// -------------------------------
// FORWARD RESPONSE
// -------------------------------
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$statusCode = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$responseHeaders = substr($response, 0, $headerSize);
$responseBody = substr($response, $headerSize);

http_response_code($statusCode);

// Add CORS headers to the proxied response so browsers can access it
set_cors_headers();

foreach (explode("\r\n", $responseHeaders) as $headerLine) {
    if (strpos($headerLine, ':') !== false) {
        [$name, $value] = explode(':', $headerLine, 2);
        $name = trim($name);
        $value = trim($value);
        $lowerName = strtolower($name);
        if (
            $lowerName === 'transfer-encoding' ||
            str_starts_with($lowerName, 'access-control-')
        ) {
            continue;
        }
        header("$name: $value", false);
    }
}

echo $responseBody;
curl_close($ch);