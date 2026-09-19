export type Role = "technicien" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Boat {
  id: string;
  name: string;
  model: string | null;
  immatriculation: string | null;
  port_attache: string | null;
  heures_moteur_actuelles: number;
  actif: number;
  interventions_en_attente?: number;
}

export type InterventionStatus = "en_attente" | "validee" | "rejetee";

export interface InterventionPart {
  id?: string;
  nom: string;
  reference?: string | null;
  quantite: number;
  prix_unitaire?: number | null;
}

export interface Intervention {
  id: string;
  boat_id: string;
  boat_name: string;
  technician_id: string;
  technician_name: string;
  date_intervention: string;
  heures_moteur: number;
  duree_heures: number;
  description: string;
  statut: InterventionStatus;
  valeur: number | null;
  commentaire_validation: string | null;
  validated_by: string | null;
  validated_by_name?: string | null;
  validated_at: string | null;
  created_at: string;
  updated_at: string;
  pieces: InterventionPart[];
}

export interface PartSuggestion {
  nom: string;
  reference: string | null;
  prix_unitaire_defaut: number | null;
}
