// --- Parameters ---
$fn = 100; // Resolution

// Barbell Settings
bar_circumference = 90; 
bar_diameter = bar_circumference / PI; // ~28.6mm
tolerance = 1.5; // INCREASED: Gives the bar more "room to breathe"

// Hook Dimensions
part_width = 25;        
wall_thickness = 5;     // REDUCED: Thinner walls = more flex/bend
gap_opening = 25;       // INCREASED: Easier to snap on and off

// String Attachment Settings
tab_thickness = 5;      
rope_hole_diameter = 3.5; 
tab_stick_out = 6;      

// --- Logic ---
inner_r = (bar_diameter + tolerance) / 2;
outer_r = inner_r + wall_thickness;
tab_center_dist = outer_r + tab_stick_out/2;

// --- Render ---
rotate([90, 0, 0]) { 
    difference() {
        
        // 1. CREATE THE POSITIVE SHAPES (Union)
        union() {
            // Main Ring
            cylinder(r = outer_r, h = part_width, center = true);
            
            // Side Tab
            translate([tab_center_dist, 0, 0])
                hull() {
                    translate([-tab_stick_out, 0, 0])
                        cylinder(r = tab_stick_out, h = tab_thickness, center = true);
                    
                    cylinder(r = tab_stick_out, h = tab_thickness, center = true);
                }
        }

        // 2. CUT THE NEGATIVE SHAPES (Difference)
        
        // A. Barbell Hole
        cylinder(r = inner_r, h = part_width + 1, center = true);

        // B. Top Opening (The "C" Gap)
        translate([0, outer_r, 0])
            cube([gap_opening, outer_r * 2, part_width + 1], center = true);

        // C. Rope Hole
        translate([tab_center_dist, 0, 0])
            cylinder(r = rope_hole_diameter / 2, h = part_width + 1, center = true);
    }
}