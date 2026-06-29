package com.iptvy.app.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.iptvy.app.R
import com.iptvy.app.data.Stream

class StreamAdapter(
    private val onClick: (Stream) -> Unit
) : RecyclerView.Adapter<StreamAdapter.VH>() {

    private var items: List<Stream> = emptyList()

    fun submit(list: List<Stream>) {
        val diff = DiffUtil.calculateDiff(object : DiffUtil.Callback() {
            override fun getOldListSize() = items.size
            override fun getNewListSize() = list.size
            override fun areItemsTheSame(o: Int, n: Int) =
                items[o].id == list[n].id && items[o].type == list[n].type
            override fun areContentsTheSame(o: Int, n: Int) = items[o] == list[n]
        })
        items = list
        diff.dispatchUpdatesTo(this)
    }

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val title: TextView = v.findViewById(R.id.streamTitle)
        val logo: ImageView = v.findViewById(R.id.streamLogo)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_stream, parent, false)
        return VH(v)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val s = items[position]
        holder.title.text = s.name
        if (s.icon.isNullOrBlank()) {
            holder.logo.setImageResource(R.drawable.ic_placeholder)
        } else {
            holder.logo.load(s.icon) {
                placeholder(R.drawable.ic_placeholder)
                error(R.drawable.ic_placeholder)
                crossfade(false)
            }
        }
        holder.itemView.setOnClickListener { onClick(s) }
    }

    override fun onViewRecycled(holder: VH) {
        holder.logo.setImageDrawable(null)
    }

    override fun getItemCount() = items.size
}
