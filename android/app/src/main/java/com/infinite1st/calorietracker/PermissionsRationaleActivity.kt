package com.infinite1st.calorietracker

import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class PermissionsRationaleActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        setContentView(TextView(this).apply {
            setText(R.string.health_permissions_rationale)
            textSize = 16f
            setPadding(pad, pad, pad, pad)
        })
    }
}
