/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { Star, Globe, Phone, MapPin, Clock, FileText, Loader2, Link } from 'lucide-react';
import { fetchPlaceSnapshot } from '@/shared/utils/placesCache';

interface GooglePlaceDetailsCardProps {
  title: string;
  category: string;
  rating?: number;
  userRatingCount?: number;
  phoneNumber?: string;
  website?: string;
  reservable?: boolean;
  editorialSummary?: string;
  formattedAddress?: string;
  openingHours?: string;
  estimatedDurationMin?: number;
  budget?: string;
}

export default function GooglePlaceDetailsCard({
  title,
  category,
  rating,
  userRatingCount,
  phoneNumber,
  website,
  reservable,
  editorialSummary,
  formattedAddress,
  openingHours,
  estimatedDurationMin,
  budget
}: GooglePlaceDetailsCardProps) {
  const placesLib = useMapsLibrary('places');
  const [place, setPlace] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    // If we have preloaded custom Google Maps metadata fields, skip calling Google Places Web API and serve instantly
    if (formattedAddress !== undefined || rating !== undefined || phoneNumber !== undefined || website !== undefined) {
      setPlace({
        displayName: title,
        formattedAddress: formattedAddress || null,
        rating: rating || null,
        userRatingCount: userRatingCount || null,
        isOpen: null,
        todayHours: openingHours || null,
        websiteUri: website || null,
        nationalPhoneNumber: phoneNumber || null,
        summary: editorialSummary || null,
        photoUrl: null,
      });
      setLoading(false);
      setError(false);
      return;
    }

    if (!placesLib || !title) return;

    let cancelled = false;
    setLoading(true);
    setError(false);

    // Shared cache (memory + localStorage) — one Places Text Search per place, ever.
    fetchPlaceSnapshot(placesLib, `${title}, Kyoto, Japan`)
      .then((snap) => {
        if (cancelled) return;
        if (snap) {
          setPlace({
            displayName: snap.displayName,
            formattedAddress: snap.formattedAddress || null,
            rating: snap.rating ?? null,
            userRatingCount: snap.userRatingCount ?? null,
            isOpen: null, // open/closed is time-sensitive; not served from cache
            openingHours: snap.weekdayDescriptions || null,
            todayHours: snap.todayHours || null,
            websiteUri: snap.websiteUri || null,
            nationalPhoneNumber: snap.nationalPhoneNumber || null,
            summary: snap.editorialSummary || null,
            photoUrl: snap.photoUrl || null,
          });
        } else {
          setError(true);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Error fetching dynamic place details:', err);
        setError(true);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [placesLib, title, rating, formattedAddress, phoneNumber, website, openingHours, editorialSummary, userRatingCount]);

  if (loading) {
    return (
      <div className="mt-3 p-4 bg-slate-50 border border-slate-100 rounded-xl flex flex-col items-center justify-center py-6 gap-2">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
        <span className="text-[10px] text-slate-500 font-medium">Fetching real-time Google Maps details...</span>
      </div>
    );
  }

  if (error || !place) {
    return null;
  }

  // Find a concise display of hours
  const shortHours = place.todayHours 
    ? place.todayHours.replace(/^[A-Za-z]+:\s*/, '') 
    : '';

  return (
    <div className="mt-3 bg-slate-50 border border-slate-150 rounded-xl overflow-hidden shadow-inner flex flex-col">
      {/* Visual cover header if photo is available */}
      {place.photoUrl && (
        <div className="h-24 w-full relative overflow-hidden bg-slate-200">
          <img 
            src={place.photoUrl} 
            alt={place.displayName} 
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center transition-transform hover:scale-105 duration-300"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-2.5">
            <div className="min-w-0">
              <span className="text-[9px] font-bold text-white uppercase bg-blue-600/90 px-1.5 py-0.5 rounded tracking-wide">
                Google Live Info
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="p-3 space-y-2.5 text-xs text-slate-700">
        {!place.photoUrl && (
          <div className="flex items-center gap-1.5 border-b border-slate-200 pb-1.5 mb-1">
            <span className="text-[9px] font-bold text-white uppercase bg-blue-600/90 px-1.5 py-0.5 rounded tracking-wide">
              Google Live Info
            </span>
          </div>
        )}

        {/* Rating and Reviews */}
        {place.rating !== undefined && (
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5 bg-amber-50 text-amber-700 font-bold px-1.5 py-0.5 rounded text-[10px] border border-amber-100">
              <Star className="w-3 h-3 fill-amber-500 text-amber-500 shrink-0" />
              <span>{place.rating}</span>
            </div>
            <span className="text-[10px] text-slate-400 font-semibold">
              ({place.userRatingCount?.toLocaleString()} Google reviews)
            </span>
          </div>
        )}

        {/* Editorial Summary */}
        {place.summary && (
          <p className="text-[10px] text-slate-600 leading-normal italic bg-white p-2 rounded-lg border border-slate-100 flex gap-1.5 items-start">
            <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span>"{place.summary}"</span>
          </p>
        )}

        <div className="grid grid-cols-1 gap-1.5 text-[10px] font-medium text-slate-600">
          {/* Real Address */}
          {place.formattedAddress && (
            <div className="flex items-start gap-1.5 leading-snug">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <span className="truncate" title={place.formattedAddress}>{place.formattedAddress}</span>
            </div>
          )}

          {/* Real Contact No */}
          {place.nationalPhoneNumber && (
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{place.nationalPhoneNumber}</span>
            </div>
          )}

          {/* Real Opening hours today (Short version as requested!) */}
          {place.todayHours && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-700">Today: {shortHours}</span>
                {place.isOpen !== null && (
                  <span className={`text-[9px] font-bold px-1 rounded-sm ${
                    place.isOpen 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                      : 'bg-red-50 text-red-700 border border-red-100'
                  }`}>
                    {place.isOpen ? 'Open Now' : 'Closed'}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Budget, Duration and Reservation details */}
        {(budget || estimatedDurationMin || reservable) && (
          <div className="flex flex-wrap gap-1.5 pt-2.5 border-t border-slate-200/65 font-medium text-[10px] text-slate-600">
            {budget && (
              <div className="flex items-center gap-1 bg-slate-100/90 border border-slate-200/40 px-2 py-0.5 rounded-md">
                <span className="text-slate-500">💰 Budget:</span>
                <span className="font-bold text-slate-800">{budget}</span>
              </div>
            )}

            {estimatedDurationMin && (
              <div className="flex items-center gap-1 bg-blue-50/80 border border-blue-100/40 px-2 py-0.5 rounded-md">
                <span className="text-slate-500">⏰ Stay:</span>
                <span className="font-bold text-blue-700">
                  {estimatedDurationMin >= 60 
                    ? `${Math.floor(estimatedDurationMin / 60)}h${estimatedDurationMin % 60 > 0 ? ` ${estimatedDurationMin % 60}m` : ''}` 
                    : `${estimatedDurationMin}m`}
                </span>
              </div>
            )}

            {reservable && (
              <div className="flex items-center gap-1 bg-orange-50/85 border border-orange-100/50 px-2 py-0.5 rounded-md">
                <span className="text-slate-500">🛎️ Booking:</span>
                <span className="font-bold text-orange-700">Advised</span>
              </div>
            )}
          </div>
        )}

        {/* Action Link Row */}
        {place.websiteUri && (
          <div className="pt-1.5 border-t border-slate-250 flex justify-end">
            <a
              href={place.websiteUri}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-md text-[9px] font-bold text-primary hover:text-accent-primary flex items-center gap-1 transition-all"
            >
              <Globe className="w-2.5 h-2.5" />
              Official Website
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
