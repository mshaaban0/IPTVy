package com.iptvy.app.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.iptvy.app.data.Prefs
import com.iptvy.app.data.XtreamClient
import com.iptvy.app.databinding.ActivityLoginBinding
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {

    private lateinit var b: ActivityLoginBinding
    private lateinit var prefs: Prefs

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this)
        b = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(b.root)

        b.serverInput.setText(prefs.server)
        b.userInput.setText(prefs.username)
        b.passInput.setText(prefs.password)

        b.loginButton.setOnClickListener { attemptLogin() }
    }

    private fun attemptLogin() {
        val server = Prefs.normalize(b.serverInput.text.toString())
        val user = b.userInput.text.toString().trim()
        val pass = b.passInput.text.toString().trim()

        if (server.isEmpty() || user.isEmpty()) {
            setStatus("Enter server and username")
            return
        }

        setBusy(true)
        setStatus("Connecting…")
        prefs.save(server, user, pass)

        lifecycleScope.launch {
            val ok = try {
                XtreamClient(prefs).login()
            } catch (e: Exception) {
                setStatus("Error: ${e.message}")
                setBusy(false)
                return@launch
            }
            if (ok) {
                startActivity(Intent(this@LoginActivity, HomeActivity::class.java))
                finish()
            } else {
                setStatus("Login failed — check credentials/server")
                setBusy(false)
            }
        }
    }

    private fun setBusy(busy: Boolean) {
        b.loginButton.isEnabled = !busy
        b.progress.visibility = if (busy) View.VISIBLE else View.GONE
    }

    private fun setStatus(text: String) {
        b.status.text = text
    }
}
