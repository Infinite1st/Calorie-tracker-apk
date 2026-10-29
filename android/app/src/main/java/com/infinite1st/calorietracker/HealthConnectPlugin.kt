package com.infinite1st.calorietracker

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.Period

/**
 * Reads burned calories from Health Connect. Samsung Health syncs data from
 * Galaxy Watch into Health Connect, so this is how the app gets watch data.
 */
@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {

    companion object {
        private const val PROVIDER_PACKAGE = "com.google.android.apps.healthdata"
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val readActive = HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class)
    private val readTotal = HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class)
    private val permissions = setOf(readActive, readTotal)
    private val permissionContract = PermissionController.createRequestPermissionResultContract()

    private fun sdkStatus() = HealthConnectClient.getSdkStatus(context, PROVIDER_PACKAGE)

    private fun client() = HealthConnectClient.getOrCreate(context)

    private fun statusResult(granted: Set<String>) = JSObject()
        .put("status", "available")
        .put("active", readActive in granted)
        .put("total", readTotal in granted)
        .put("granted", granted.any { it in permissions })

    private fun unavailableResult(status: Int) = JSObject()
        .put("status", if (status == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) "update_required" else "unavailable")
        .put("active", false)
        .put("total", false)
        .put("granted", false)

    private fun resolveWithGrantedPermissions(call: PluginCall) {
        scope.launch {
            try {
                call.resolve(statusResult(client().permissionController.getGrantedPermissions()))
            } catch (e: Exception) {
                call.reject(e.message ?: "Не удалось проверить разрешения Health Connect", e)
            }
        }
    }

    @PluginMethod
    fun checkStatus(call: PluginCall) {
        val status = sdkStatus()
        if (status != HealthConnectClient.SDK_AVAILABLE) {
            call.resolve(unavailableResult(status))
            return
        }
        resolveWithGrantedPermissions(call)
    }

    @PluginMethod
    fun requestAuthorization(call: PluginCall) {
        val status = sdkStatus()
        if (status != HealthConnectClient.SDK_AVAILABLE) {
            call.resolve(unavailableResult(status))
            return
        }
        startActivityForResult(call, permissionContract.createIntent(context, permissions), "onPermissionsResult")
    }

    @ActivityCallback
    private fun onPermissionsResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        resolveWithGrantedPermissions(call)
    }

    @PluginMethod
    fun openHealthConnect(call: PluginCall) {
        val intents = if (sdkStatus() == HealthConnectClient.SDK_AVAILABLE) {
            listOfNotNull(
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) Intent("android.health.connect.action.HEALTH_HOME_SETTINGS") else null,
                Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
            )
        } else {
            listOf(
                Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$PROVIDER_PACKAGE&url=healthconnect%3A%2F%2Fonboarding"))
                    .setPackage("com.android.vending"),
                Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$PROVIDER_PACKAGE"))
            )
        }
        for (intent in intents) {
            try {
                activity.startActivity(intent)
                call.resolve()
                return
            } catch (e: ActivityNotFoundException) {
                // try the next option
            }
        }
        call.reject("Не удалось открыть Health Connect")
    }

    /** Returns per-day burned kcal for [startDate, endDate] (YYYY-MM-DD, inclusive). */
    @PluginMethod
    fun getBurnedCalories(call: PluginCall) {
        val startDate = call.getString("startDate")
        val endDate = call.getString("endDate")
        if (startDate == null || endDate == null) {
            call.reject("Нужны startDate и endDate")
            return
        }
        if (sdkStatus() != HealthConnectClient.SDK_AVAILABLE) {
            call.reject("Health Connect недоступен", "UNAVAILABLE")
            return
        }
        scope.launch {
            try {
                val hc = client()
                val granted = hc.permissionController.getGrantedPermissions()
                val metrics = mutableSetOf<AggregateMetric<*>>()
                if (readActive in granted) metrics += ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL
                if (readTotal in granted) metrics += TotalCaloriesBurnedRecord.ENERGY_TOTAL
                if (metrics.isEmpty()) {
                    call.reject("Нет доступа к данным о калориях", "NO_PERMISSION")
                    return@launch
                }

                val start = LocalDate.parse(startDate).atStartOfDay()
                val endOfRange = LocalDate.parse(endDate).plusDays(1).atStartOfDay()
                val now = LocalDateTime.now()
                val end = if (endOfRange.isAfter(now)) now else endOfRange

                val days = JSArray()
                if (start.isBefore(end)) {
                    val groups = hc.aggregateGroupByPeriod(
                        AggregateGroupByPeriodRequest(
                            metrics = metrics,
                            timeRangeFilter = TimeRangeFilter.between(start, end),
                            timeRangeSlicer = Period.ofDays(1)
                        )
                    )
                    for (group in groups) {
                        val day = JSObject().put("date", group.startTime.toLocalDate().toString())
                        group.result[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.let { day.put("active", it.inKilocalories) }
                        group.result[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.let { day.put("total", it.inKilocalories) }
                        days.put(day)
                    }
                }
                call.resolve(JSObject().put("days", days))
            } catch (e: Exception) {
                call.reject(e.message ?: "Не удалось прочитать данные Health Connect", e)
            }
        }
    }

    override fun handleOnDestroy() {
        scope.cancel()
    }
}
