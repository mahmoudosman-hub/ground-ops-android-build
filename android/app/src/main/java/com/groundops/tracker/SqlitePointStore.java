package com.groundops.tracker;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import com.groundops.tracker.core.TrackingCore;

import java.util.ArrayList;
import java.util.List;

/** Durable, ordered, duplicate-free queue of location points (app-private SQLite). UNIQUE(employee, ts) = no duplicate records. */
public final class SqlitePointStore extends SQLiteOpenHelper implements TrackingCore.Store {
    public SqlitePointStore(Context ctx) { super(ctx.getApplicationContext(), "gops_points.db", null, 1); }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE points (id INTEGER PRIMARY KEY AUTOINCREMENT, employee TEXT NOT NULL, ts INTEGER NOT NULL, json TEXT NOT NULL, UNIQUE(employee, ts))");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int o, int n) { /* v1 only */ }

    @Override public synchronized boolean insert(String employeeId, long tsMs, String pointJson) {
        ContentValues v = new ContentValues();
        v.put("employee", employeeId); v.put("ts", tsMs); v.put("json", pointJson);
        return getWritableDatabase().insertWithOnConflict("points", null, v, SQLiteDatabase.CONFLICT_IGNORE) != -1;
    }
    @Override public synchronized List<TrackingCore.StoredPoint> peek(String employeeId, int max) {
        List<TrackingCore.StoredPoint> out = new ArrayList<TrackingCore.StoredPoint>();
        Cursor c = getReadableDatabase().query("points", new String[]{"id", "json"}, "employee = ?", new String[]{employeeId}, null, null, "ts ASC", String.valueOf(max));
        try { while (c.moveToNext()) out.add(new TrackingCore.StoredPoint(c.getLong(0), c.getString(1))); } finally { c.close(); }
        return out;
    }
    @Override public synchronized void delete(List<Long> ids) {
        if (ids.isEmpty()) return;
        StringBuilder in = new StringBuilder();
        for (int i = 0; i < ids.size(); i++) { if (i > 0) in.append(','); in.append(ids.get(i).longValue()); }
        getWritableDatabase().execSQL("DELETE FROM points WHERE id IN (" + in + ")");
    }
    @Override public synchronized int count(String employeeId) {
        Cursor c = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM points WHERE employee = ?", new String[]{employeeId});
        try { return c.moveToFirst() ? c.getInt(0) : 0; } finally { c.close(); }
    }
    @Override public synchronized void clear(String employeeId) { getWritableDatabase().delete("points", "employee = ?", new String[]{employeeId}); }
}
