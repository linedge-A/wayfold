/**
 * Copyright 2024 Google LLC
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Search, Heart, Bookmark, MapPin, Calendar, Clock, Globe, Navigation, ChevronRight, User } from 'lucide-react';
import { motion } from 'motion/react';

interface ExploreTrip {
  id: string;
  title: string;
  description: string;
  creator: {
    name: string;
    avatar: string;
  };
  date: string;
  stops: number;
  days: number;
  likes: string;
  imageUrl: string;
  tags: string[];
  isFeatured?: boolean;
}

const EXPLORE_TRIPS: ExploreTrip[] = [
  {
    id: 'explore-1',
    title: 'Kyoto Serenity',
    description: 'A minimalist guide to Zen gardens, hidden teahouses, and morning forest walks in Arashiyama.',
    creator: {
      name: 'Yuki K.',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Yuki'
    },
    date: '12 Oct 2023',
    stops: 8,
    days: 5,
    likes: '1.2k',
    imageUrl: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=600&auto=format&fit=crop',
    tags: ['Asia', 'Featured'],
    isFeatured: true
  },
  {
    id: 'explore-2',
    title: 'Alpine Explorer',
    description: 'High-altitude adventure through the Bernese Oberland. Focusing on cable cars and summit views.',
    creator: {
      name: 'Marcus J.',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Marcus'
    },
    date: '28 Sep 2023',
    stops: 12,
    days: 7,
    likes: '842',
    imageUrl: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=600&auto=format&fit=crop',
    tags: ['Europe'],
  },
  {
    id: 'explore-3',
    title: 'Santorini Escape',
    description: 'A photography-first itinerary covering the most photogenic spots in Oia and Fira at dawn.',
    creator: {
      name: 'Elena L.',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Elena'
    },
    date: '05 Aug 2023',
    stops: 5,
    days: 3,
    likes: '2.1k',
    imageUrl: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?q=80&w=600&auto=format&fit=crop',
    tags: ['Europe', 'Featured'],
    isFeatured: true
  },
  {
    id: 'explore-4',
    title: 'Tokyo Tech Tour',
    description: 'Exploring the future in Akihabara and Odaiba. Includes hidden tech museums and retro arcade stops.',
    creator: {
      name: 'Tom H.',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Tom'
    },
    date: '15 Nov 2023',
    stops: 15,
    days: 4,
    likes: '560',
    imageUrl: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?q=80&w=600&auto=format&fit=crop',
    tags: ['Asia'],
  },
  {
    id: 'explore-5',
    title: 'Nordic Winter',
    description: "A cozy route through Southern Iceland's waterfalls and black sand beaches in the off-season.",
    creator: {
      name: 'Soren M.',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Soren'
    },
    date: '12 Jan 2024',
    stops: 10,
    days: 6,
    likes: '1.5k',
    imageUrl: 'https://images.unsplash.com/photo-1476610182048-b716b8518aae?q=80&w=600&auto=format&fit=crop',
    tags: ['Europe'],
  },
  {
    id: 'explore-6',
    title: 'Costa Rica Wild',
    description: 'Sustainable travel guide through Monteverde Cloud Forest and Manuel Antonio park.',
    creator: {
      name: 'Luis R.',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Luis'
    },
    date: '22 Dec 2023',
    stops: 20,
    days: 10,
    likes: '980',
    imageUrl: 'https://images.unsplash.com/photo-1518182170546-07661fd94144?q=80&w=600&auto=format&fit=crop',
    tags: ['Americas'],
  }
];

interface ExplorePageProps {
  onViewChange?: (view: 'plan' | 'trips' | 'explore') => void;
}

export default function ExplorePage({ onViewChange }: ExplorePageProps) {
  const [activeTag, setActiveTag] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const tags = ['All', 'Featured', 'Asia', 'Europe', 'Americas'];

  const filteredTrips = EXPLORE_TRIPS.filter(trip => {
    const matchesTag = activeTag === 'All' || trip.tags.includes(activeTag);
    const matchesSearch = trip.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         trip.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTag && matchesSearch;
  });

  return (
    <div className="flex-1 h-full bg-[#F7F6F2] overflow-y-auto custom-scrollbar">
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Header Controls */}
        <section className="mb-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6A7470] w-4.5 h-4.5" />
                <input
                  type="text"
                  placeholder="Search destinations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-white border border-[#E4E2DE] rounded-[8px] text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all shadow-sm"
                />
              </div>
              
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                {tags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(tag)}
                    className={`px-5 py-2.5 rounded-[8px] text-xs font-bold transition-all whitespace-nowrap cursor-pointer border ${
                      activeTag === tag
                        ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                        : 'bg-white text-[#6A7470] border-[#E4E2DE] hover:border-primary/30 hover:text-primary transition-colors'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-[#6A7470] uppercase tracking-widest">Sort by:</span>
              <select className="bg-transparent border-none text-sm font-bold text-on-surface focus:ring-0 cursor-pointer p-1 outline-none">
                <option>Popular</option>
                <option>Newest</option>
                <option>Curated</option>
              </select>
            </div>
          </div>
        </section>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredTrips.map((trip) => (
            <ExploreCard 
              key={trip.id} 
              trip={trip} 
              onViewChange={onViewChange}
            />
          ))}
        </div>

        {/* Load More */}
        <div className="mt-16 flex justify-center pb-12">
          <button className="px-10 py-3.5 bg-white border border-[#E4E2DE] rounded-[10px] text-sm font-bold text-[#6A7470] hover:bg-[#F7F6F2] hover:border-[#D9DDD8] transition-all shadow-sm active:scale-95 cursor-pointer">
            Load More Trips
          </button>
        </div>
      </main>
    </div>
  );
}

function ExploreCard(props: { trip: ExploreTrip; key?: any; onViewChange?: (view: 'plan') => void }) {
  const { trip, onViewChange } = props;
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      className="group flex flex-col bg-white border border-slate-100 rounded-[8px] overflow-hidden shadow-sm hover:shadow-md hover:shadow-slate-200/50 transition-all"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img 
          src={trip.imageUrl} 
          alt={trip.title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          referrerPolicy="no-referrer"
        />
        <div className="absolute top-4 left-4 flex gap-2">
          {trip.isFeatured && (
            <span className="h-6 px-3 flex items-center bg-primary/90 backdrop-blur-md text-white rounded-[8px] text-[10px] font-bold tracking-wider uppercase shadow-lg">
              Featured
            </span>
          )}
        </div>
        <div className="absolute bottom-4 right-4 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-[8px] text-white text-[11px] font-bold flex items-center gap-1.5 border border-white/20">
          <Bookmark className="w-3.5 h-3.5 fill-white" />
          Saved
        </div>
      </div>

      <div className="p-5 flex flex-col flex-grow">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full overflow-hidden bg-slate-100 border border-slate-100">
              <img src={trip.creator.avatar} alt={trip.creator.name} className="w-full h-full object-cover" />
            </div>
            <span className="text-[11px] font-bold text-[#6A7470]">{trip.creator.name}</span>
          </div>
          <span className="text-[10px] font-bold text-[#D9DDD8] uppercase tracking-tight">{trip.date}</span>
        </div>

        <h3 className="text-lg font-bold text-on-surface mb-1.5 group-hover:text-primary transition-colors">{trip.title}</h3>
        <p className="text-sm text-[#6A7470] leading-relaxed line-clamp-2 mb-5">
          {trip.description}
        </p>

        <div className="flex items-center gap-5 mt-auto mb-6">
          <div className="flex items-center gap-1.5 text-[#6A7470]">
            <MapPin className="w-3.5 h-3.5" />
            <span className="text-xs font-bold">{trip.stops} Stops</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#6A7470]">
            <Calendar className="w-3.5 h-3.5" />
            <span className="text-xs font-bold">{trip.days} Days</span>
          </div>
          <div className="flex items-center gap-1.5 text-[#6A7470]">
            <Heart className="w-3.5 h-3.5" />
            <span className="text-xs font-bold">{trip.likes}</span>
          </div>
        </div>

        <div className="flex gap-2.5">
          <button 
            onClick={() => { if (onViewChange) onViewChange('plan'); }}
            className="flex-1 h-11 bg-primary text-white rounded-[10px] text-sm font-bold hover:bg-accent-primary-hover active:scale-[0.97] transition-all shadow-lg shadow-primary/20 cursor-pointer"
          >
            View Itinerary
          </button>
          <button className="w-11 h-11 flex items-center justify-center bg-white border border-[#E4E2DE] rounded-[10px] text-primary hover:bg-primary-soft hover:border-primary/30 transition-all active:scale-[0.97] cursor-pointer">
            <Bookmark className="w-5 h-5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
