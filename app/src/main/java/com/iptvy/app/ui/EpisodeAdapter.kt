package com.iptvy.app.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.iptvy.app.R
import com.iptvy.app.data.Episode

class EpisodeAdapter(
    private val onClick: (Episode) -> Unit
) : RecyclerView.Adapter<EpisodeAdapter.VH>() {

    private var items: List<Episode> = emptyList()

    fun submit(list: List<Episode>) {
        items = list
        notifyDataSetChanged()
    }

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val label: TextView = v.findViewById(R.id.episodeLabel)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_episode, parent, false)
        return VH(v)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val e = items[position]
        holder.label.text = "S${e.season} · ${e.title}"
        holder.itemView.setOnClickListener { onClick(e) }
    }

    override fun getItemCount() = items.size
}
