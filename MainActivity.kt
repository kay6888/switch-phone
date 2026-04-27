package com.enilabs.unlimitedswitch

import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.launch
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.URISyntaxException

class MainActivity : AppCompatActivity() {
    private lateinit var socket: Socket
    private lateinit var currentNumberText: TextView
    private lateinit var switchNumberButton: Button
    private lateinit var numberHistoryText: TextView
    
    private val client = OkHttpClient()
    private val JSON = "application/json; charset=utf-8".toMediaType()
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        currentNumberText = findViewById(R.id.currentNumberText)
        switchNumberButton = findViewById(R.id.switchNumberButton)
        numberHistoryText = findViewById(R.id.numberHistoryText)
        
        // Connect WebSocket
        try {
            socket = IO.socket("http://your-server-ip:3000")
            socket.connect()
            
            socket.on("number_provisioned") { args ->
                val number = args[0] as? String ?: ""
                runOnUiThread {
                    currentNumberText.text = number
                    Toast.makeText(this, "New number provisioned: $number", Toast.LENGTH_LONG).show()
                    loadNumberHistory()
                }
            }
        } catch (e: URISyntaxException) {
            e.printStackTrace()
        }
        
        // Switch number button - NO LIMITS CHECKING
        switchNumberButton.setOnClickListener {
            lifecycleScope.launch {
                switchToNewNumber()
            }
        }
        
        loadCurrentNumber()
        loadNumberHistory()
    }
    
    private suspend fun switchToNewNumber() {
        val userId = getUserId() // Get or generate user ID from SharedPreferences
        
        val json = JSONObject().apply {
            put("userId", userId)
        }
        
        val request = Request.Builder()
            .url("http://your-server-ip:3000/api/provision")
            .post(json.toString().toRequestBody(JSON))
            .build()
        
        client.newCall(request).execute().use { response ->
            if (response.isSuccessful) {
                runOnUiThread {
                    Toast.makeText(this, "Provisioning new number...", Toast.LENGTH_SHORT).show()
                    switchNumberButton.isEnabled = false
                    // Will be re-enabled when WebSocket receives number_provisioned
                }
            } else {
                runOnUiThread {
                    Toast.makeText(this, "Error: ${response.code}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
    
    private fun loadCurrentNumber() {
        val userId = getUserId()
        // GET request to fetch current number from backend
        val request = Request.Builder()
            .url("http://your-server-ip:3000/api/current-number?userId=$userId")
            .build()
        
        lifecycleScope.launch {
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val json = JSONObject(response.body?.string() ?: "{}")
                    val number = json.optString("current_number", "No number assigned")
                    runOnUiThread {
                        currentNumberText.text = number
                        switchNumberButton.isEnabled = true
                    }
                }
            }
        }
    }
    
    private fun loadNumberHistory() {
        val userId = getUserId()
        val request = Request.Builder()
            .url("http://your-server-ip:3000/api/number-history?userId=$userId")
            .build()
        
        lifecycleScope.launch {
            client.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    val json = JSONObject(response.body?.string() ?: "{}")
                    val history = json.optJSONArray("history") ?: JSONArray()
                    val historyString = (0 until history.length()).joinToString("\n") { history.getString(it) }
                    runOnUiThread {
                        numberHistoryText.text = if (historyString.isNotEmpty()) historyString else "No history yet"
                    }
                }
            }
        }
    }
    
    private fun getUserId(): String {
        val prefs = getSharedPreferences("app_prefs", MODE_PRIVATE)
        var userId = prefs.getString("user_id", null)
        if (userId == null) {
            userId = java.util.UUID.randomUUID().toString()
            prefs.edit().putString("user_id", userId).apply()
        }
        return userId
    }
}
