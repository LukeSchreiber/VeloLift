// --- BARBELL VELOCITY TRACKER: STEP-SPOOL v2 (Easy Threading) ---
// Hole size: 4.5mm (Upgraded) | Flanges: +2mm wider for strength
$fn = 100; 

// SHAFT & MOUNTING
shaft_diameter = 6.2;      
boss_diameter = 16;        
boss_height = 10;          
m3_screw_diameter = 3.2;   
m3_nut_width = 5.7;        

// DRUM 1: MAIN (Barbell Line)
main_drum_diameter = 65;   
main_drum_width = 15;      
flange_height = 2;         

// INCREASED FLANGE SIZE
// Old: 4mm -> New: 6mm (To support the bigger hole)
flange_extra = 6;          

// DRUM 2: STEP DOWN (Badge Reel Line)
small_drum_diameter = 22;  
small_drum_width = 10;     

// STRING HOLES
// INCREASED HOLE SIZE
// Old: 2.5mm -> New: 4.5mm (Easy to pass a knot)
string_hole_diameter = 4.5;

// --- GEOMETRY GENERATION ---

difference() {
    // 1. POSITIVE GEOMETRY
    union() {
        // A. Mounting Boss
        cylinder(d=boss_diameter, h=boss_height);
        
        // B. Bottom Flange
        translate([0,0, boss_height])
            cylinder(d=main_drum_diameter + (flange_extra*2), h=flange_height);
            
        // C. Main Drum Body
        translate([0,0, boss_height + flange_height])
            cylinder(d=main_drum_diameter, h=main_drum_width);
            
        // D. Middle Flange
        translate([0,0, boss_height + flange_height + main_drum_width])
            cylinder(d=main_drum_diameter + (flange_extra*2), h=flange_height);
            
        // E. Small Drum Body
        translate([0,0, boss_height + flange_height + main_drum_width + flange_height])
            cylinder(d=small_drum_diameter, h=small_drum_width);
            
        // F. Top Flange
        translate([0,0, boss_height + flange_height + main_drum_width + flange_height + small_drum_width])
            cylinder(d=small_drum_diameter + (flange_extra*2), h=flange_height);
    }

    // 2. NEGATIVE GEOMETRY
    union() {
        // A. Main Shaft Hole
        translate([0,0,-1])
            cylinder(d=shaft_diameter, h=100);
            
        // B. Set Screw Hole
        translate([0, 0, boss_height/2])
            rotate([0, 90, 0])
            cylinder(d=m3_screw_diameter, h=boss_diameter+5, center=true);
            
        // C. String Tie Hole: Main Drum (Angled)
        translate([main_drum_diameter/2 - 2, 0, boss_height])
            rotate([0, 45, 0])
            cylinder(d=string_hole_diameter, h=20, center=true);

        // D. String Tie Hole: Small Drum (Angled)
        translate([small_drum_diameter/2 - 1, 0, boss_height + main_drum_width + small_drum_width + flange_height*2])
            rotate([0, 45, 0])
            cylinder(d=string_hole_diameter, h=20, center=true);
            
        // E. Mass Reduction
        difference() {
            translate([0,0, boss_height + flange_height])
                cylinder(d=main_drum_diameter - 4, h=main_drum_width);
            cylinder(d=boss_diameter + 4, h=100, center=true); 
        }
    }
}