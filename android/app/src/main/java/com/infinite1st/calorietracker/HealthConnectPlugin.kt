package com.infinite1st.calorietracker

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.ReadRecordsRequest
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
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.reflect.KClass

/**
 * Reads burned calories from Health Connect. Samsung Health syncs data from
 * Galaxy Watch into Health Connect, so this is how the app gets watch data.
 */
@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {

    companion object {
        private const val PROVIDER_PACKAGE = "com.google.android.apps.healthdata"
        private const val SAMSUNG_HEALTH_PACKAGE = "com.sec.android.app.shealth"
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

    /** Reads every page of records of [type] in [filter]. */
    private suspend fun <T : Record> readAll(hc: HealthConnectClient, type: KClass<T>, filter: TimeRangeFilter): List<T> {
        val records = mutableListOf<T>()
        var pageToken: String? = null
        do {
            val response = hc.readRecords(ReadRecordsRequest(recordType = type, timeRangeFilter = filter, pageToken = pageToken))
            records += response.records
            pageToken = response.pageToken
        } while (pageToken != null)
        return records
    }

    /** Adds [kcal] of a record to day -> app -> kcal, splitting records that cross midnight. */
    private fun addByDay(
        out: MutableMap<LocalDate, MutableMap<String, Double>>,
        app: String, start: Instant, end: Instant, kcal: Double, zone: ZoneId
    ) {
        val totalMs = Duration.between(start, end).toMillis()
        if (totalMs <= 0) {
            out.getOrPut(start.atZone(zone).toLocalDate()) { mutableMapOf() }.merge(app, kcal) { a, b -> a + b }
            return
        }
        var cursor = start
        while (cursor.isBefore(end)) {
            val day = cursor.atZone(zone).toLocalDate()
            val nextDay = day.plusDays(1).atStartOfDay(zone).toInstant()
            val segmentEnd = if (nextDay.isBefore(end)) nextDay else end
            val part = kcal * Duration.between(cursor, segmentEnd).toMillis() / totalMs
            out.getOrPut(day) { mutableMapOf() }.merge(app, part) { a, b -> a + b }
            cursor = segmentEnd
        }
    }

    /** Samsung Health wins; otherwise the app with the most data, so overlapping sources are not double counted. */
    private fun pickSource(byApp: Map<String, Double>?): Pair<String, Double>? {
        if (byApp.isNullOrEmpty()) return null
        byApp[SAMSUNG_HEALTH_PACKAGE]?.let { return SAMSUNG_HEALTH_PACKAGE to it }
        return byApp.maxByOrNull { it.value }?.toPair()
    }

    /**
     * Returns per-day burned kcal for [startDate, endDate] (YYYY-MM-DD, inclusive).
     * Raw records are summed instead of using Health Connect aggregates: the total-calories
     * aggregate fills gaps with an estimated BMR, which would show numbers that never came from the watch.
     */
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
                if (readActive !in granted && readTotal !in granted) {
                    call.reject("Нет доступа к данным о калориях", "NO_PERMISSION")
                    return@launch
                }

                val zone = ZoneId.systemDefault()
                val firstDay = LocalDate.parse(startDate)
                val lastDay = LocalDate.parse(endDate)
                val filter = TimeRangeFilter.between(
                    firstDay.atStartOfDay(zone).toInstant(),
                    lastDay.plusDays(1).atStartOfDay(zone).toInstant()
                )

                val active = mutableMapOf<LocalDate, MutableMap<String, Double>>()
                val total = mutableMapOf<LocalDate, MutableMap<String, Double>>()
                if (readActive in granted) {
                    for (r in readAll(hc, ActiveCaloriesBurnedRecord::class, filter)) {
                        addByDay(active, r.metadata.dataOrigin.packageName, r.startTime, r.endTime, r.energy.inKilocalories, zone)
                    }
                }
                if (readTotal in granted) {
                    for (r in readAll(hc, TotalCaloriesBurnedRecord::class, filter)) {
                        addByDay(total, r.metadata.dataOrigin.packageName, r.startTime, r.endTime, r.energy.inKilocalories, zone)
                    }
                }

                val days = JSArray()
                var day = firstDay
                while (!day.isAfter(lastDay)) {
                    val activeByApp = active[day]
                    val totalByApp = total[day]
                    if (activeByApp != null || totalByApp != null) {
                        val item = JSObject().put("date", day.toString())
                        pickSource(activeByApp)?.let { item.put("active", it.second).put("activeSource", it.first) }
                        pickSource(totalByApp)?.let { item.put("total", it.second).put("totalSource", it.first) }
                        val sources = JSArray()
                        for (app in (activeByApp.orEmpty().keys + totalByApp.orEmpty().keys).toSortedSet()) {
                            val source = JSObject().put("app", app)
                            activeByApp?.get(app)?.let { source.put("active", it) }
                            totalByApp?.get(app)?.let { source.put("total", it) }
                            sources.put(source)
                        }
                        item.put("sources", sources)
                        days.put(item)
                    }
                    day = day.plusDays(1)
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
