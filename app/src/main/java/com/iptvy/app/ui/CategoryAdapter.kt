package com.iptvy.app.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.iptvy.app.R
import com.iptvy.app.data.Category

class CategoryAdapter(
    private val onClick: (Category) -> Unit
) : RecyclerView.Adapter<CategoryAdapter.VH>() {

    private var items: List<Category> = emptyList()
    private var selected = 0

    fun submit(list: List<Category>) {
        items = list
        selected = 0
        notifyDataSetChanged()
    }

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val label: TextView = v.findViewById(R.id.categoryLabel)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_category, parent, false)
        return VH(v)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val c = items[position]
        holder.label.text = c.name
        holder.label.isSelected = position == selected
        holder.itemView.setOnClickListener {
            val old = selected
            selected = holder.bindingAdapterPosition
            notifyItemChanged(old)
            notifyItemChanged(selected)
            onClick(c)
        }
    }

    override fun getItemCount() = items.size
}
