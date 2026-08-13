package org.hkm.vizagrequest

import android.Manifest
import android.app.PendingIntent
import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.print.PrintAttributes
import android.print.PrintManager
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.io.OutputStream
import java.util.UUID

class PrinterBridge(private val context: Context) {

    private val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    private val bluetoothAdapter: BluetoothAdapter? = BluetoothAdapter.getDefaultAdapter()
    private val usbPermissionAction = "org.hkm.vizagrequest.USB_PERMISSION"

    private var usbConnection: UsbDeviceConnection? = null
    private var usbInterface: UsbInterface? = null
    private var usbEndpointOut: UsbEndpoint? = null
    private var usbDevice: UsbDevice? = null

    private var bluetoothSocket: BluetoothSocket? = null
    private var bluetoothOutput: OutputStream? = null
    private var bluetoothLabel: String = ""

    private var lastTransport: String = ""
    private var lastLabel: String = "Not connected"

    private val usbPermissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != usbPermissionAction) return
            val device = intent.getParcelableExtra<UsbDevice>(UsbManager.EXTRA_DEVICE)
            val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
            if (granted && device != null) {
                lastLabel = "USB permission granted. Tap Connect USB Printer again."
            } else {
                lastLabel = "USB permission denied"
            }
        }
    }

    init {
        val filter = IntentFilter(usbPermissionAction)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(usbPermissionReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(usbPermissionReceiver, filter)
        }
    }

    @JavascriptInterface
    fun getStatus(): String {
        return response(
            ok = true,
            message = lastLabel,
            extra = mapOf(
                "ready" to isReady(),
                "label" to lastLabel,
                "transport" to lastTransport,
                "nativePrint" to true
            )
        )
    }

    @JavascriptInterface
    fun canNativePrint(): String {
        return response(true, "Native print available", mapOf("nativePrint" to true))
    }

    @JavascriptInterface
    fun printHtml(title: String?, html: String?): String {
        val activity = context as? Activity
            ?: return response(false, "Activity context is not available for printing")
        val safeHtml = (html ?: "").trim()
        if (safeHtml.isEmpty()) {
            return response(false, "Nothing to print")
        }
        val jobTitle = (title ?: "HKM Receipt").ifBlank { "HKM Receipt" }
        activity.runOnUiThread {
            try {
                val printWebView = WebView(activity)
                printWebView.settings.javaScriptEnabled = false
                printWebView.settings.domStorageEnabled = false
                printWebView.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView?, url: String?) {
                        val printManager = activity.getSystemService(Context.PRINT_SERVICE) as? PrintManager
                        if (printManager != null && view != null) {
                            val adapter = view.createPrintDocumentAdapter(jobTitle)
                            printManager.print(
                                jobTitle,
                                adapter,
                                PrintAttributes.Builder().build()
                            )
                        }
                    }
                }
                printWebView.loadDataWithBaseURL(null, safeHtml, "text/html", "UTF-8", null)
            } catch (_: Exception) {
                // native print dialog errors are surfaced by missing dialog / service
            }
        }
        return response(true, "Print dialog opened", mapOf("nativePrint" to true))
    }

    @JavascriptInterface
    fun connectUsbPrinter(): String {
        val candidate = findUsbCandidate()
            ?: return response(false, "No compatible USB printer detected")

        if (!usbManager.hasPermission(candidate)) {
            val permissionIntent = PendingIntent.getBroadcast(
                context,
                0,
                Intent(usbPermissionAction),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            usbManager.requestPermission(candidate, permissionIntent)
            lastLabel = "USB permission requested. Allow it and tap again."
            return response(false, lastLabel)
        }

        val iface = findWritableUsbInterface(candidate)
            ?: return response(false, "No writable USB interface found")
        val endpoint = findWritableUsbEndpoint(iface)
            ?: return response(false, "No writable USB endpoint found")
        val connection = usbManager.openDevice(candidate)
            ?: return response(false, "Could not open USB device")

        if (!connection.claimInterface(iface, true)) {
            connection.close()
            return response(false, "Could not claim USB interface")
        }

        closeUsbOnly()
        usbDevice = candidate
        usbConnection = connection
        usbInterface = iface
        usbEndpointOut = endpoint
        lastTransport = "usb"
        lastLabel = buildUsbLabel(candidate)
        return response(true, "USB printer connected", mapOf("transport" to "usb", "label" to lastLabel))
    }

    @JavascriptInterface
    fun connectBluetoothPrinter(nameHint: String?): String {
        if (bluetoothAdapter == null) {
            return response(false, "Bluetooth is not available on this device")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
        ) {
            return response(false, "Bluetooth permission is not granted")
        }
        val bonded = bluetoothAdapter.bondedDevices.orEmpty()
        if (bonded.isEmpty()) {
            return response(false, "No paired Bluetooth printer found")
        }
        val hint = (nameHint ?: "").trim().lowercase()
        val device = bonded.firstOrNull { hint.isNotEmpty() && (it.name ?: "").lowercase().contains(hint) }
            ?: bonded.firstOrNull { (it.name ?: "").contains("printer", ignoreCase = true) }
            ?: bonded.firstOrNull()
            ?: return response(false, "No paired Bluetooth printer found")

        val connectResult = connectBluetoothSocket(device)
        return if (connectResult != null) {
            bluetoothSocket = connectResult
            bluetoothOutput = connectResult.outputStream
            bluetoothLabel = "Bluetooth: ${device.name ?: "Printer"}"
            lastTransport = "bluetooth"
            lastLabel = bluetoothLabel
            response(true, "Bluetooth printer connected", mapOf("transport" to "bluetooth", "label" to bluetoothLabel))
        } else {
            response(false, lastLabel.ifBlank { "Could not connect Bluetooth printer" })
        }
    }

    private fun connectBluetoothSocket(device: BluetoothDevice): BluetoothSocket? {
        closeBluetoothOnly()
        bluetoothAdapter?.cancelDiscovery()
        val defaultUuid = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
        val advertisedUuids = device.uuids?.mapNotNull { it?.uuid }?.distinct().orEmpty()

        var lastError: Exception? = null
        for (uuid in (advertisedUuids + defaultUuid).distinct()) {
            try {
                val socket = device.createRfcommSocketToServiceRecord(uuid)
                socket.connect()
                return socket
            } catch (error: Exception) {
                lastError = error
                try {
                    // ignore
                } catch (_: Exception) {
                    // ignore
                }
            }
            try {
                val insecureSocket = device.createInsecureRfcommSocketToServiceRecord(uuid)
                insecureSocket.connect()
                return insecureSocket
            } catch (error: Exception) {
                lastError = error
            }
        }

        try {
            @Suppress("UNCHECKED_CAST")
            val method = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
            val legacySocket = method.invoke(device, 1) as BluetoothSocket
            legacySocket.connect()
            return legacySocket
        } catch (error: Exception) {
            lastError = error
        }

        lastLabel = buildString {
            append(lastError?.message ?: "Could not connect Bluetooth printer")
            if (advertisedUuids.isNotEmpty()) {
                append(" | UUIDs tried: ")
                append(advertisedUuids.joinToString(", "))
            }
        }
        return null
    }

    @JavascriptInterface
    fun testPrint(): String {
        val bytes = byteArrayOf(
            0x1B.toByte(), 0x40.toByte(),
            0x1B.toByte(), 0x61.toByte(), 0x01.toByte(),
            0x48.toByte(), 0x4B.toByte(), 0x4D.toByte(), 0x20.toByte(), 0x54.toByte(), 0x45.toByte(), 0x53.toByte(), 0x54.toByte(), 0x0A.toByte(),
            0x1B.toByte(), 0x61.toByte(), 0x00.toByte(),
            0x50.toByte(), 0x72.toByte(), 0x69.toByte(), 0x6E.toByte(), 0x74.toByte(), 0x65.toByte(), 0x72.toByte(), 0x20.toByte(), 0x43.toByte(), 0x6F.toByte(), 0x6E.toByte(), 0x6E.toByte(), 0x65.toByte(), 0x63.toByte(), 0x74.toByte(), 0x65.toByte(), 0x64.toByte(), 0x0A.toByte(),
            0x0A.toByte(), 0x0A.toByte()
        )
        return sendBytes(bytes)
    }

    @JavascriptInterface
    fun printBase64(base64: String): String {
        return try {
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            sendBytes(bytes)
        } catch (error: Exception) {
            response(false, error.message ?: "Could not decode print payload")
        }
    }

    private fun sendBytes(bytes: ByteArray): String {
        return try {
            when (lastTransport) {
                "usb" -> {
                    val connection = usbConnection ?: return response(false, "USB printer is not connected")
                    val endpoint = usbEndpointOut ?: return response(false, "USB endpoint is not available")
                    val sent = connection.bulkTransfer(endpoint, bytes, bytes.size, 5000)
                    if (sent <= 0) {
                        response(false, "USB print failed")
                    } else {
                        response(true, "Print sent successfully")
                    }
                }
                "bluetooth" -> {
                    val output = bluetoothOutput ?: return response(false, "Bluetooth printer is not connected")
                    output.write(bytes)
                    output.flush()
                    response(true, "Print sent successfully")
                }
                else -> response(false, "Printer is not connected")
            }
        } catch (error: Exception) {
            response(false, error.message ?: "Printer write failed")
        }
    }

    private fun findUsbCandidate(): UsbDevice? {
        return usbManager.deviceList.values.firstOrNull { device ->
            findWritableUsbInterface(device) != null
        }
    }

    private fun findWritableUsbInterface(device: UsbDevice): UsbInterface? {
        for (i in 0 until device.interfaceCount) {
            val iface = device.getInterface(i)
            if (findWritableUsbEndpoint(iface) != null) {
                return iface
            }
        }
        return null
    }

    private fun findWritableUsbEndpoint(iface: UsbInterface): UsbEndpoint? {
        for (i in 0 until iface.endpointCount) {
            val endpoint = iface.getEndpoint(i)
            if (endpoint.direction == UsbConstants.USB_DIR_OUT) {
                return endpoint
            }
        }
        return null
    }

    private fun buildUsbLabel(device: UsbDevice): String {
        val name = device.productName ?: device.deviceName ?: "USB Printer"
        return "USB: $name"
    }

    private fun isReady(): Boolean {
        return when (lastTransport) {
            "usb" -> usbConnection != null && usbEndpointOut != null
            "bluetooth" -> bluetoothSocket?.isConnected == true && bluetoothOutput != null
            else -> false
        }
    }

    fun close() {
        closeUsbOnly()
        closeBluetoothOnly()
        try {
            context.unregisterReceiver(usbPermissionReceiver)
        } catch (_: Exception) {
            // ignore
        }
    }

    private fun closeUsbOnly() {
        try {
            usbConnection?.releaseInterface(usbInterface)
        } catch (_: Exception) {
            // ignore
        }
        try {
            usbConnection?.close()
        } catch (_: Exception) {
            // ignore
        }
        usbConnection = null
        usbInterface = null
        usbEndpointOut = null
        usbDevice = null
    }

    private fun closeBluetoothOnly() {
        try {
            bluetoothOutput?.close()
        } catch (_: Exception) {
            // ignore
        }
        try {
            bluetoothSocket?.close()
        } catch (_: Exception) {
            // ignore
        }
        bluetoothOutput = null
        bluetoothSocket = null
        bluetoothLabel = ""
    }

    private fun response(ok: Boolean, message: String, extra: Map<String, Any?> = emptyMap()): String {
        val json = JSONObject()
        json.put("ok", ok)
        json.put("message", message)
        extra.forEach { (key, value) -> json.put(key, value) }
        return json.toString()
    }
}

